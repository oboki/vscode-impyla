import * as vscode from "vscode";
import {
  ChildProcessWithoutNullStreams,
  spawn,
} from "child_process";
import * as path from "path";
import {
  ConnectionConfig,
  QueryExecutionResponse,
  QueryResult,
  QueryServerInfo,
} from "../types";
import { PythonEnvironmentService } from "./pythonEnvironmentService";
import { ConfigService } from "./configService";
import { GLOBAL_PASSWORD_SECRET_KEY } from "../commands/manageGlobalPassword";

const GLOBAL_PASSWORD_POINTER = "secret://global";

type ServerRequest =
  | {
      action: "execute";
      connection: ConnectionConfig;
      sql: string;
      page_size?: number;
      idle_timeout_seconds?: number;
    }
  | {
      action: "fetch";
      session_id: string;
      page_size: number;
    }
  | {
      action: "close";
      session_id: string;
    }
  | {
      action: "close_all";
    };

type ServerResponse = {
  id: number;
  success: boolean;
  columns?: string[];
  rows?: any[][];
  row_count?: number;
  execution_time_ms?: number;
  has_more?: boolean;
  session_id?: string | null;
  server_info?: QueryServerInfo;
  error?: string;
  error_type?: "ConnectionError" | "SQLSyntaxError" | "ImpalaError";
  is_auth_failure?: boolean;
};

type PendingRequest = {
  resolve: (response: ServerResponse) => void;
  reject: (error: Error) => void;
};

/**
 * Service for executing Impala queries
 */
export class ImpalaService implements vscode.Disposable {
  private sessionServerProcess: ChildProcessWithoutNullStreams | null = null;
  private responseBuffer = "";
  private requestId = 0;
  private pendingRequests = new Map<number, PendingRequest>();

  constructor(
    private pythonService: PythonEnvironmentService,
    private configService: ConfigService,
    private secrets: vscode.SecretStorage,
    private outputChannel: vscode.OutputChannel,
    private extensionPath: string,
  ) {}

  /**
   * Execute a SQL query against Impala
   */
  async executeQuery(
    sql: string,
    cancellationToken?: vscode.CancellationToken,
    paging?: { pageSize?: number; idleTimeoutSeconds?: number },
  ): Promise<
    | { success: true; result: QueryResult }
    | {
        success: false;
        error: string;
        errorType?: string;
        isAuthFailure?: boolean;
      }
  > {
    const pythonPath = await this.pythonService.findPython();
    if (!pythonPath) {
      return {
        success: false,
        error:
          "Python executable not found. Please install Python 3.7+ and ensure it is in your PATH.",
        errorType: "ConnectionError",
      };
    }

    const config = this.configService.getConfig();
    if (!config) {
      return {
        success: false,
        error: "Configuration not loaded. Please create a .impyla.yml file.",
        errorType: "ConnectionError",
      };
    }

    const resolvedConnection = await this.resolveConnectionPassword(
      config.connection,
    );
    if (!resolvedConnection.success) {
      return resolvedConnection;
    }

    if (cancellationToken?.isCancellationRequested) {
      return {
        success: false,
        error: "Query execution cancelled by user",
      };
    }

    try {
      const response = await this.sendServerRequest(pythonPath, {
        action: "execute",
        connection: resolvedConnection.connection,
        sql,
        page_size: paging?.pageSize,
        idle_timeout_seconds: paging?.idleTimeoutSeconds,
      });

      return this.toServiceResult(response);
    } catch (error) {
      return {
        success: false,
        error: `Failed to execute query: ${error}`,
        errorType: "ConnectionError",
      };
    }
  }

  async fetchNextPage(
    sessionId: string,
    pageSize: number,
  ): Promise<
    | { success: true; result: QueryResult }
    | {
        success: false;
        error: string;
        errorType?: string;
        isAuthFailure?: boolean;
      }
  > {
    const pythonPath = await this.pythonService.findPython();
    if (!pythonPath) {
      return {
        success: false,
        error: "Python executable not found.",
        errorType: "ConnectionError",
      };
    }

    try {
      const response = await this.sendServerRequest(pythonPath, {
        action: "fetch",
        session_id: sessionId,
        page_size: pageSize,
      });

      return this.toServiceResult(response);
    } catch (error) {
      return {
        success: false,
        error: `Failed to fetch next page: ${error}`,
        errorType: "ConnectionError",
      };
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    if (!this.sessionServerProcess) {
      return;
    }

    const pythonPath = await this.pythonService.findPython();
    if (!pythonPath) {
      return;
    }

    try {
      await this.sendServerRequest(pythonPath, {
        action: "close",
        session_id: sessionId,
      });
    } catch {
      // Session might already be expired or server may be shutting down.
    }
  }

  dispose(): void {
    void this.stopSessionServer();
  }

  private async stopSessionServer(): Promise<void> {
    if (!this.sessionServerProcess) {
      return;
    }

    const process = this.sessionServerProcess;
    this.sessionServerProcess = null;

    try {
      process.stdin.write(
        `${JSON.stringify({ id: -1, action: "close_all" })}\n`,
      );
    } catch {
      // no-op
    }

    process.kill();

    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error("Query session server stopped"));
    }
    this.pendingRequests.clear();
  }

  private async ensureSessionServer(
    pythonPath: string,
  ): Promise<ChildProcessWithoutNullStreams> {
    if (this.sessionServerProcess) {
      return this.sessionServerProcess;
    }

    const scriptPath = path.join(
      this.extensionPath,
      "python",
      "query_session_server.py",
    );
    const process = spawn(pythonPath, ["-u", scriptPath]);

    this.responseBuffer = "";

    process.stdout.on("data", (data: Buffer) => {
      this.responseBuffer += data.toString();
      const lines = this.responseBuffer.split("\n");
      this.responseBuffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        try {
          const response = JSON.parse(line) as ServerResponse;
          const pending = this.pendingRequests.get(response.id);
          if (!pending) {
            continue;
          }
          this.pendingRequests.delete(response.id);
          pending.resolve(response);
        } catch (error) {
          this.outputChannel.appendLine(
            `Failed to parse session server response: ${error}`,
          );
        }
      }
    });

    process.stderr.on("data", (data: Buffer) => {
      this.outputChannel.appendLine(
        `[session-server] ${data.toString().trimEnd()}`,
      );
    });

    process.on("close", (code) => {
      this.outputChannel.appendLine(
        `Query session server exited with code ${code}`,
      );
      if (this.sessionServerProcess === process) {
        this.sessionServerProcess = null;
      }

      for (const [, pending] of this.pendingRequests) {
        pending.reject(new Error("Query session server exited"));
      }
      this.pendingRequests.clear();
    });

    process.on("error", (error) => {
      this.outputChannel.appendLine(`Query session server error: ${error}`);
    });

    this.sessionServerProcess = process;
    return process;
  }

  private async sendServerRequest(
    pythonPath: string,
    payload: ServerRequest,
  ): Promise<ServerResponse> {
    const process = await this.ensureSessionServer(pythonPath);
    const id = ++this.requestId;

    return await new Promise<ServerResponse>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      try {
        process.stdin.write(`${JSON.stringify({ id, ...payload })}\n`);
      } catch (error) {
        this.pendingRequests.delete(id);
        reject(error as Error);
      }
    });
  }

  private toServiceResult(
    response: ServerResponse,
  ):
    | { success: true; result: QueryResult }
    | {
        success: false;
        error: string;
        errorType?: string;
        isAuthFailure?: boolean;
      } {
    if (response.success && response.columns && response.rows) {
      const result: QueryResult = {
        columns: response.columns,
        rows: response.rows,
        rowCount: response.row_count || 0,
        executionTimeMs: response.execution_time_ms || 0,
        hasMore: response.has_more || false,
        sessionId: response.session_id,
        serverInfo: response.server_info,
      };

      this.outputChannel.appendLine(
        `Query page fetched: ${result.rowCount} rows in ${result.executionTimeMs}ms` +
          (result.sessionId ? ` (session=${result.sessionId})` : ""),
      );

      return {
        success: true,
        result,
      };
    }

    this.outputChannel.appendLine(`Query execution error: ${response.error}`);
    return {
      success: false,
      error: response.error || "Unknown error",
      errorType: response.error_type,
      isAuthFailure:
        response.is_auth_failure ??
        this.isPotentialAuthFailure(response.error || ""),
    };
  }

  private async resolveConnectionPassword(
    connection: ConnectionConfig,
  ): Promise<
    | { success: true; connection: ConnectionConfig }
    | { success: false; error: string; errorType?: string; isAuthFailure?: boolean }
  > {
    if (connection.password !== GLOBAL_PASSWORD_POINTER) {
      return { success: true, connection };
    }

    const savedPassword = await this.secrets.get(GLOBAL_PASSWORD_SECRET_KEY);
    if (savedPassword) {
      return {
        success: true,
        connection: {
          ...connection,
          password: savedPassword,
        },
      };
    }

    const action = await vscode.window.showWarningMessage(
      "connection.password is set to secret://global, but no saved global password was found.",
      "Enter Password",
      "Cancel",
    );

    if (action !== "Enter Password") {
      return {
        success: false,
        error:
          "Global password is not set. Run 'Impyla: Set Global Password' from the Command Palette or use a plaintext connection.password value.",
        errorType: "ConnectionError",
      };
    }

    const enteredPassword = await vscode.window.showInputBox({
      prompt: "Enter the Impyla global password",
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value || !value.trim()) {
          return "Password is required";
        }
        return null;
      },
    });

    if (!enteredPassword) {
      return {
        success: false,
        error: "Global password entry was cancelled.",
        errorType: "ConnectionError",
      };
    }

    await this.secrets.store(GLOBAL_PASSWORD_SECRET_KEY, enteredPassword);
    vscode.window.showInformationMessage("Global password has been saved.");

    return {
      success: true,
      connection: {
        ...connection,
        password: enteredPassword,
      },
    };
  }

  private isPotentialAuthFailure(errorText: string): boolean {
    if (!errorText) {
      return false;
    }

    const normalized = errorText.toLowerCase();
    const highConfidencePatterns = [
      /authentication\s+failed/i,
      /invalid\s+credentials?/i,
      /bad\s+credentials?/i,
      /login\s+failed/i,
      /error\s+validating\s+the\s+login/i,
      /password\s+is\s+incorrect/i,
      /ldap.*(invalid|failed|reject|denied)/i,
    ];

    return highConfidencePatterns.some((pattern) => pattern.test(normalized));
  }
}
