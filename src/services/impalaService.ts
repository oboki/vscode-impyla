import * as vscode from "vscode";
import { spawn } from "child_process";
import * as path from "path";
import {
  QueryExecutionRequest,
  QueryExecutionResponse,
  QueryResult,
} from "../types";
import { PythonEnvironmentService } from "./pythonEnvironmentService";
import { ConfigService } from "./configService";

/**
 * Service for executing Impala queries
 */
export class ImpalaService {
  constructor(
    private pythonService: PythonEnvironmentService,
    private configService: ConfigService,
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
    | { success: false; error: string; errorType?: string }
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

    // Prepare request
    const request: QueryExecutionRequest = {
      connection: config.connection,
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
}
