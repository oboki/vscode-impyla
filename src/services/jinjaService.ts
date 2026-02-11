import * as vscode from "vscode";
import { spawn } from "child_process";
import * as path from "path";
import { JinjaRenderRequest, JinjaRenderResponse } from "../types";
import { PythonEnvironmentService } from "./pythonEnvironmentService";
import { ConfigService } from "./configService";

/**
 * Service for rendering Jinja2 templates with custom macros
 */
export class JinjaService {
  constructor(
    private pythonService: PythonEnvironmentService,
    private configService: ConfigService,
    private outputChannel: vscode.OutputChannel,
    private extensionPath: string,
  ) {}

  /**
   * Detect if content contains Jinja syntax
   */
  hasJinjaSyntax(content: string): boolean {
    const patterns = [
      /\{\{/, // Variable syntax
      /\{%/, // Statement syntax
      /\{#/, // Comment syntax
    ];

    return patterns.some((pattern) => pattern.test(content));
  }

  /**
   * Render a Jinja2 template
   */
  async renderTemplate(
    template: string,
    workspaceFolder?: string,
  ): Promise<
    | { success: true; rendered: string; loadedPlugins: string[] }
    | { success: false; error: string; line?: number }
  > {
    const pythonPath = await this.pythonService.findPython();
    if (!pythonPath) {
      return {
        success: false,
        error:
          "Python executable not found. Please install Python 3.7+ and ensure it is in your PATH.",
      };
    }

    const config = this.configService.getConfig();
    const jinjaConfig = config?.jinja || {};

    // Prepare request
    const baseDir =
      workspaceFolder ||
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
      "";
    const request: JinjaRenderRequest = {
      template,
      variables: jinjaConfig.variables || {},
      plugin_paths: jinjaConfig.plugin_paths || [],
      base_dir: baseDir,
    };

    // Execute Python script
    const scriptPath = path.join(
      this.extensionPath,
      "python",
      "render_jinja.py",
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

      process.on("close", (code) => {
        if (code !== 0) {
          this.outputChannel.appendLine(
            `Jinja rendering failed with code ${code}`,
          );
          this.outputChannel.appendLine(`stderr: ${stderr}`);
          resolve({
            success: false,
            error: `Jinja rendering failed: ${stderr || "Unknown error"}`,
          });
          return;
        }

        try {
          const response: JinjaRenderResponse = JSON.parse(stdout);

          if (response.success && response.rendered) {
            this.outputChannel.appendLine(
              "Jinja template rendered successfully",
            );
            if (response.loaded_plugins && response.loaded_plugins.length > 0) {
              this.outputChannel.appendLine(
                `Loaded plugins: ${response.loaded_plugins.join(", ")}`,
              );
            }
            resolve({
              success: true,
              rendered: response.rendered,
              loadedPlugins: response.loaded_plugins || [],
            });
          } else {
            this.outputChannel.appendLine(
              `Jinja rendering error: ${response.error}`,
            );
            resolve({
              success: false,
              error: response.error || "Unknown error",
              line: response.line,
            });
          }
        } catch (error) {
          this.outputChannel.appendLine(
            `Failed to parse Jinja response: ${error}`,
          );
          this.outputChannel.appendLine(`stdout: ${stdout}`);
          resolve({
            success: false,
            error: `Failed to parse response: ${error}`,
          });
        }
      });

      process.on("error", (error) => {
        this.outputChannel.appendLine(`Jinja process error: ${error}`);
        resolve({
          success: false,
          error: `Failed to execute Jinja renderer: ${error}`,
        });
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        process.kill();
        resolve({
          success: false,
          error: "Jinja rendering timed out after 30 seconds",
        });
      }, 30000);
    });
  }
}
