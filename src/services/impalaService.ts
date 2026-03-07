import * as vscode from "vscode";
import { spawn } from "child_process";
import * as path from "path";
import {
  ConnectionConfig,
  QueryExecutionRequest,
  QueryExecutionResponse,
  QueryResult,
} from "../types";
import { PythonEnvironmentService } from "./pythonEnvironmentService";
import { ConfigService } from "./configService";
import { GLOBAL_PASSWORD_SECRET_KEY } from "../commands/manageGlobalPassword";

const GLOBAL_PASSWORD_POINTER = "secret://global";

/**
 * Service for executing Impala queries
 */
export class ImpalaService {
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

    // Prepare request
    const request: QueryExecutionRequest = {
      connection: resolvedConnection.connection,
      sql,
      max_rows: config.extension?.max_rows || 10000,
    };

    // Execute Python script
    const scriptPath = path.join(
      this.extensionPath,
      "python",
      "execute_query.py",
    );

    return new Promise((resolve) => {
      const process = spawn(pythonPath, ["-u", scriptPath]);

      let stdout = "";
      let stderr = "";

      process.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      process.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      process.stdin.write(JSON.stringify(request));
      process.stdin.end();

      // Handle cancellation
      if (cancellationToken) {
        cancellationToken.onCancellationRequested(() => {
          process.kill();
          resolve({
            success: false,
            error: "Query execution cancelled by user",
          });
        });
      }

      process.on("close", (code) => {
        if (cancellationToken?.isCancellationRequested) {
          return; // Already handled
        }

        if (code !== 0) {
          this.outputChannel.appendLine(
            `Query execution failed with code ${code}`,
          );
          this.outputChannel.appendLine(`stderr: ${stderr}`);
          resolve({
            success: false,
            error: `Query execution failed: ${stderr || "Unknown error"}`,
            errorType: "ImpalaError",
            isAuthFailure: this.isPotentialAuthFailure(stderr),
          });
          return;
        }

        try {
          const response: QueryExecutionResponse = JSON.parse(stdout);

          if (response.success && response.columns && response.rows) {
            this.outputChannel.appendLine(
              `Query executed successfully: ${response.row_count} rows in ${response.execution_time_ms}ms`,
            );

            const result: QueryResult = {
              columns: response.columns,
              rows: response.rows,
              rowCount: response.row_count || 0,
              executionTimeMs: response.execution_time_ms || 0,
              hasMore: response.has_more || false,
            };

            resolve({
              success: true,
              result,
            });
          } else {
            this.outputChannel.appendLine(
              `Query execution error: ${response.error}`,
            );
            resolve({
              success: false,
              error: response.error || "Unknown error",
              errorType: response.error_type,
              isAuthFailure:
                response.is_auth_failure ??
                this.isPotentialAuthFailure(response.error || ""),
            });
          }
        } catch (error) {
          this.outputChannel.appendLine(
            `Failed to parse query response: ${error}`,
          );
          this.outputChannel.appendLine(`stdout: ${stdout}`);
          resolve({
            success: false,
            error: `Failed to parse response: ${error}`,
            errorType: "ImpalaError",
          });
        }
      });

      process.on("error", (error) => {
        this.outputChannel.appendLine(`Query process error: ${error}`);
        resolve({
          success: false,
          error: `Failed to execute query: ${error}`,
          errorType: "ConnectionError",
        });
      });
    });
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
      "password가 secret://global로 설정되어 있지만 저장된 글로벌 비밀번호가 없습니다.",
      "비밀번호 입력",
      "취소",
    );

    if (action !== "비밀번호 입력") {
      return {
        success: false,
        error:
          "글로벌 비밀번호가 설정되지 않았습니다. Command Palette에서 'Impyla: Set Global Password'를 실행하거나 평문 password를 설정하세요.",
        errorType: "ConnectionError",
      };
    }

    const enteredPassword = await vscode.window.showInputBox({
      prompt: "Impyla 글로벌 비밀번호를 입력하세요",
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value || !value.trim()) {
          return "비밀번호를 입력하세요";
        }
        return null;
      },
    });

    if (!enteredPassword) {
      return {
        success: false,
        error: "글로벌 비밀번호 입력이 취소되었습니다.",
        errorType: "ConnectionError",
      };
    }

    await this.secrets.store(GLOBAL_PASSWORD_SECRET_KEY, enteredPassword);
    vscode.window.showInformationMessage("글로벌 비밀번호가 저장되었습니다.");

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
