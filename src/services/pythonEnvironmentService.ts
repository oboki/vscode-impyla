import * as vscode from "vscode";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

/**
 * Service for managing Python environment and dependencies
 */
export class PythonEnvironmentService {
  private pythonPath: string | null = null;
  private dependenciesChecked = false;
  private checkInProgress = false;
  private checkPromise: Promise<boolean> | null = null;

  constructor(private outputChannel: vscode.OutputChannel) {}

  /**
   * Find Python executable
   */
  async findPython(): Promise<string | null> {
    if (this.pythonPath) {
      return this.pythonPath;
    }

    // Strategy 1: Check VSCode Python extension settings
    const pythonConfig = vscode.workspace.getConfiguration("python");
    const pythonPathFromConfig = pythonConfig.get<string>(
      "defaultInterpreterPath",
    );
    if (pythonPathFromConfig && (await this.testPython(pythonPathFromConfig))) {
      this.pythonPath = pythonPathFromConfig;
      this.outputChannel.appendLine(
        `Found Python from VSCode settings: ${this.pythonPath}`,
      );
      return this.pythonPath;
    }

    // Strategy 2: Check workspace config
    const impylaConfig = vscode.workspace.getConfiguration("impyla");
    const workspacePythonPath = impylaConfig.get<string>("pythonPath");
    if (workspacePythonPath && (await this.testPython(workspacePythonPath))) {
      this.pythonPath = workspacePythonPath;
      this.outputChannel.appendLine(
        `Found Python from workspace config: ${this.pythonPath}`,
      );
      return this.pythonPath;
    }

    // Strategy 3: Try common Python names
    const pythonNames = [
      "python3",
      "python",
      "python3.11",
      "python3.10",
      "python3.9",
      "python3.8",
      "python3.7",
    ];
    for (const name of pythonNames) {
      if (await this.testPython(name)) {
        this.pythonPath = name;
        this.outputChannel.appendLine(`Found Python: ${this.pythonPath}`);
        return this.pythonPath;
      }
    }

    this.outputChannel.appendLine("Python executable not found");
    return null;
  }

  /**
   * Test if a Python path is valid and meets version requirements
   */
  private async testPython(pythonPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn(pythonPath, ["--version"]);

      let output = "";
      process.stdout.on("data", (data) => {
        output += data.toString();
      });

      process.stderr.on("data", (data) => {
        output += data.toString();
      });

      process.on("close", (code) => {
        if (code === 0) {
          // Check version (should be 3.7+)
          const versionMatch = output.match(/Python (\d+)\.(\d+)/);
          if (versionMatch) {
            const major = parseInt(versionMatch[1]);
            const minor = parseInt(versionMatch[2]);
            if (major === 3 && minor >= 7) {
              resolve(true);
              return;
            }
          }
        }
        resolve(false);
      });

      process.on("error", () => {
        resolve(false);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        process.kill();
        resolve(false);
      }, 5000);
    });
  }

  /**
   * Check if required Python packages are installed
   */
  async checkDependencies(): Promise<boolean> {
    // If already checked successfully, return immediately
    if (this.dependenciesChecked) {
      return true;
    }

    // If check is in progress, wait for it
    if (this.checkInProgress && this.checkPromise) {
      this.outputChannel.appendLine(
        "Dependencies check already in progress, waiting...",
      );
      return this.checkPromise;
    }

    // Start new check
    this.checkInProgress = true;
    this.checkPromise = this.performDependencyCheck();

    try {
      const result = await this.checkPromise;
      return result;
    } finally {
      this.checkInProgress = false;
      this.checkPromise = null;
    }
  }

  /**
   * Perform the actual dependency check
   */
  private async performDependencyCheck(): Promise<boolean> {
    const pythonPath = await this.findPython();
    if (!pythonPath) {
      return false;
    }

    const requiredPackages: Record<string, string> = {
      impyla: "impala",
      jinja2: "jinja2",
    };

    const missingPackages: string[] = [];

    for (const [pipName, importName] of Object.entries(requiredPackages)) {
      const installed = await this.checkPackage(pythonPath, importName);
      if (!installed) {
        missingPackages.push(pipName);
      }
    }

    if (missingPackages.length > 0) {
      this.outputChannel.appendLine(
        `Missing Python packages: ${missingPackages.join(", ")}`,
      );

      const answer = await vscode.window.showWarningMessage(
        `Missing required Python packages: ${missingPackages.join(", ")}. Install them now?`,
        "Install",
        "Cancel",
      );

      if (answer !== "Install") {
        return false;
      }

      const installed = await this.installPackages(missingPackages);
      if (!installed) {
        return false;
      }
    }

    this.dependenciesChecked = true;
    this.outputChannel.appendLine("All Python dependencies are installed");
    return true;
  }

  /**
   * Check if a Python package is installed
   */
  private async checkPackage(
    pythonPath: string,
    packageName: string,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn(pythonPath, ["-c", `import ${packageName}`]);

      process.on("close", (code) => {
        resolve(code === 0);
      });

      process.on("error", () => {
        resolve(false);
      });

      setTimeout(() => {
        process.kill();
        resolve(false);
      }, 5000);
    });
  }

  /**
   * Install Python packages using pip
   */
  private async installPackages(packages: string[]): Promise<boolean> {
    const pythonPath = this.pythonPath;
    if (!pythonPath) {
      return false;
    }

    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Installing Python packages...",
        cancellable: false,
      },
      async (progress) => {
        return new Promise<boolean>((resolve) => {
          progress.report({ message: `Installing: ${packages.join(", ")}` });

          const process = spawn(pythonPath, [
            "-m",
            "pip",
            "install",
            ...packages,
          ]);

          let output = "";
          process.stdout.on("data", (data) => {
            output += data.toString();
            this.outputChannel.append(data.toString());
          });

          process.stderr.on("data", (data) => {
            output += data.toString();
            this.outputChannel.append(data.toString());
          });

          process.on("close", (code) => {
            if (code === 0) {
              this.outputChannel.appendLine("Packages installed successfully");
              vscode.window.showInformationMessage(
                "Python packages installed successfully",
              );
              resolve(true);
            } else {
              this.outputChannel.appendLine("Failed to install packages");
              vscode.window.showErrorMessage(
                "Failed to install Python packages. Check output for details.",
              );
              resolve(false);
            }
          });

          process.on("error", (error) => {
            this.outputChannel.appendLine(
              `Error installing packages: ${error}`,
            );
            vscode.window.showErrorMessage(
              `Failed to install packages: ${error}`,
            );
            resolve(false);
          });
        });
      },
    );
  }

  /**
   * Get Python executable path
   */
  getPythonPath(): string | null {
    return this.pythonPath;
  }

  /**
   * Get Python executable details for terminal commands
   */
  async getPythonExecutableDetails(): Promise<{
    command: string;
    args: string[];
  } | null> {
    const pythonPath = await this.findPython();
    if (!pythonPath) {
      return null;
    }

    return {
      command: pythonPath,
      args: [],
    };
  }
}
