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
