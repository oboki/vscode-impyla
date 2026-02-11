import * as vscode from "vscode";
import * as yaml from "js-yaml";
import * as fs from "fs";
import * as path from "path";
import { ImpylaConfig } from "../types";

/**
 * Service for managing .impyla.yml configuration files
 */
export class ConfigService {
  private config: ImpylaConfig | null = null;
  private configPath: string | null = null;
  private fileWatcher: vscode.FileSystemWatcher | null = null;

  constructor(private outputChannel: vscode.OutputChannel) {}

  /**
   * Load configuration from workspace root
   */
  async loadConfig(): Promise<ImpylaConfig | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.outputChannel.appendLine("No workspace folder found");
      this.config = null;
      this.configPath = null;
      return null;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const newConfigPath = path.join(workspaceRoot, ".impyla.yml");

    // If workspace changed, clear old config
    if (this.configPath && this.configPath !== newConfigPath) {
      this.outputChannel.appendLine(
        `Workspace changed from ${this.configPath} to ${newConfigPath}`,
      );
      this.config = null;
      if (this.fileWatcher) {
        this.fileWatcher.dispose();
        this.fileWatcher = null;
      }
    }

    this.configPath = newConfigPath;

    this.outputChannel.appendLine(
      `Looking for configuration at: ${this.configPath}`,
    );
    this.outputChannel.appendLine(`Workspace root: ${workspaceRoot}`);
    this.outputChannel.appendLine(
      `File exists: ${fs.existsSync(this.configPath)}`,
    );

    // Always set up file watcher to detect when file is created
    this.setupFileWatcher();

    if (!fs.existsSync(this.configPath)) {
      this.outputChannel.appendLine(
        `Configuration file not found: ${this.configPath}`,
      );
      this.config = null;
      return null;
    }

    try {
      const fileContent = fs.readFileSync(this.configPath, "utf8");
      const parsedConfig = yaml.load(fileContent) as any;

      // Substitute environment variables
      const processedConfig = this.substituteEnvVars(parsedConfig);

      // Validate required fields
      if (!this.validateConfig(processedConfig)) {
        vscode.window.showErrorMessage("Invalid .impyla.yml configuration");
        return null;
      }

      this.config = processedConfig;
      this.outputChannel.appendLine(
        `Configuration loaded successfully from ${this.configPath}`,
      );

      return this.config;
    } catch (error) {
      this.outputChannel.appendLine(`Error loading configuration: ${error}`);
      vscode.window.showErrorMessage(`Failed to load .impyla.yml: ${error}`);
      return null;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): ImpylaConfig | null {
    return this.config;
  }

  /**
   * Check if configuration is loaded
   */
  isConfigLoaded(): boolean {
    return this.config !== null;
  }

  /**
   * Get configuration file path
   */
  getConfigPath(): string | null {
    return this.configPath;
  }

  /**
   * Substitute environment variables in configuration
   */
  private substituteEnvVars(obj: any): any {
    if (typeof obj === "string") {
      return obj.replace(/\$\{([^}]+)\}/g, (match, varName) => {
        return process.env[varName] || match;
      });
    } else if (Array.isArray(obj)) {
      return obj.map((item) => this.substituteEnvVars(item));
    } else if (obj !== null && typeof obj === "object") {
      const result: any = {};
      for (const key in obj) {
        result[key] = this.substituteEnvVars(obj[key]);
      }
      return result;
    }
    return obj;
  }

  /**
   * Validate configuration structure
   */
  private validateConfig(config: any): boolean {
    if (!config.connection) {
      this.outputChannel.appendLine("Missing required field: connection");
      return false;
    }

    const conn = config.connection;
    if (!conn.host) {
      this.outputChannel.appendLine("Missing required field: connection.host");
      return false;
    }

    // Set defaults
    config.connection.port = conn.port || 21050;
    config.connection.database = conn.database || "default";
    config.connection.auth_mechanism = conn.auth_mechanism || "NOSASL";
    config.connection.timeout = conn.timeout || 300;
    config.connection.use_ssl = conn.use_ssl || false;

    config.jinja = config.jinja || {};
    config.jinja.plugin_paths = config.jinja.plugin_paths || [];
    config.jinja.variables = config.jinja.variables || {};

    config.extension = config.extension || {};
    config.extension.max_rows = config.extension.max_rows || 10000;
    config.extension.python_path = config.extension.python_path || "python3";
    config.extension.auto_preview =
      config.extension.auto_preview !== undefined
        ? config.extension.auto_preview
        : true;

    return true;
  }

  /**
   * Set up file watcher for auto-reload
   */
  private setupFileWatcher() {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
    }

    if (!this.configPath) {
      return;
    }

    // Watch for .impyla.yml in the workspace root
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return;
    }

    const pattern = new vscode.RelativePattern(
      workspaceFolders[0],
      ".impyla.yml",
    );
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

    this.fileWatcher.onDidChange(() => {
      this.outputChannel.appendLine("Configuration file changed, reloading...");
      this.loadConfig();
    });

    this.fileWatcher.onDidDelete(() => {
      this.outputChannel.appendLine("Configuration file deleted");
      this.config = null;
      this.configPath = null;
    });

    this.fileWatcher.onDidCreate(() => {
      this.outputChannel.appendLine("Configuration file created, loading...");
      this.loadConfig();
    });
  }

  /**
   * Dispose resources
   */
  dispose() {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
    }
  }
}
