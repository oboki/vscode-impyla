import * as vscode from "vscode";
import { spawn } from "child_process";

type DependencyCheckResult =
  | { status: "ready" }
  | { status: "missing"; missingPackages: string[]; pythonPath: string }
  | { status: "no-python" };

/**
 * Service for managing Python environment and dependencies
 */
export class PythonEnvironmentService {
  private pythonPath: string | null = null;
  private dependenciesChecked = false;
  private checkInProgress = false;
  private checkPromise: Promise<DependencyCheckResult> | null = null;
  private installPromptInProgress = false;
  private installPromptPromise: Promise<boolean> | null = null;

  constructor(private outputChannel: vscode.OutputChannel) {}

  /**
   * Find Python executable
   */
  async findPython(): Promise<string | null> {
    if (this.pythonPath) {
      return this.pythonPath;
    }

    // Strategy 1: Check extension setting
    const impylaConfig = vscode.workspace.getConfiguration("impyla");
    const workspacePythonPath = impylaConfig.get<string>("pythonPath");
    if (workspacePythonPath && (await this.testPython(workspacePythonPath))) {
      this.pythonPath = workspacePythonPath;
      this.outputChannel.appendLine(
        `Found Python from impyla.pythonPath: ${this.pythonPath}`,
      );
      return this.pythonPath;
    }
    if (workspacePythonPath) {
      this.outputChannel.appendLine(
        `Configured impyla.pythonPath is invalid or unsupported: ${workspacePythonPath}`,
      );
    }

    // Strategy 2: Try common Python names from PATH
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
      const inFlightResult = await this.checkPromise;
      return await this.handleDependencyCheckResult(inFlightResult);
    }

    // Start new check
    this.checkInProgress = true;
    this.checkPromise = this.performDependencyCheck();

    let result: DependencyCheckResult;
    try {
      result = await this.checkPromise;
    } finally {
      this.checkInProgress = false;
      this.checkPromise = null;
    }

    return await this.handleDependencyCheckResult(result);
  }

  /**
   * Perform the actual dependency check
   */
  private async performDependencyCheck(): Promise<DependencyCheckResult> {
    const pythonPath = await this.findPython();
    if (!pythonPath) {
      return { status: "no-python" };
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
      return {
        status: "missing",
        missingPackages,
        pythonPath,
      };
    }

    return { status: "ready" };
  }

  /**
   * Handle dependency check result, including optional install prompt
   */
  private async handleDependencyCheckResult(
    result: DependencyCheckResult,
  ): Promise<boolean> {
    if (result.status === "no-python") {
      return false;
    }

    if (result.status === "ready") {
      this.dependenciesChecked = true;
      this.outputChannel.appendLine("All Python dependencies are installed");
      return true;
    }

    if (this.installPromptInProgress && this.installPromptPromise) {
      this.outputChannel.appendLine(
        "Dependency installation prompt already in progress, waiting...",
      );
      return await this.installPromptPromise;
    }

    this.installPromptInProgress = true;
    this.installPromptPromise = this.promptAndInstallMissingPackages(
      result.missingPackages,
      result.pythonPath,
    );

    try {
      return await this.installPromptPromise;
    } finally {
      this.installPromptInProgress = false;
      this.installPromptPromise = null;
    }
  }

  /**
   * Prompt user and install missing packages
   */
  private async promptAndInstallMissingPackages(
    missingPackages: string[],
    pythonPathForCheck: string,
  ): Promise<boolean> {
    const answer = await vscode.window.showWarningMessage(
      `Missing required Python packages: ${missingPackages.join(", ")}. Install them now?`,
      "Install",
      "Cancel",
    );

    if (answer !== "Install") {
      return false;
    }

    const installed = await this.installPackages(
      missingPackages,
      pythonPathForCheck,
    );
    if (!installed) {
      return false;
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
  private async installPackages(
    packages: string[],
    preferredPythonPath?: string,
  ): Promise<boolean> {
    const pythonPath = preferredPythonPath || (await this.findPython());
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
   * Reset resolved Python path and dependency state
   */
  resetEnvironmentState(): void {
    this.pythonPath = null;
    this.dependenciesChecked = false;
    this.outputChannel.appendLine(
      "Python environment state reset due to configuration change",
    );
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
