import * as vscode from "vscode";
import * as yaml from "js-yaml";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ImpylaConfig } from "../types";

export const GLOBAL_PASSWORD_POINTER = "secret://global";

/**
 * Service for managing .impyla.yml configuration files
 */
export class ConfigService {
  private config: ImpylaConfig | null = null;
  private configPath: string | null = null;
  private fileWatchers: vscode.FileSystemWatcher[] = [];

  constructor(private outputChannel: vscode.OutputChannel) {}

  /**
   * Load configuration from workspace root
   */
  async loadConfig(): Promise<ImpylaConfig | null> {
    const candidatePaths = this.getCandidateConfigPaths();
    this.setupFileWatchers(candidatePaths);

    const selectedPath = candidatePaths.find((candidatePath) =>
      fs.existsSync(candidatePath),
    );

    if (!selectedPath) {
      this.outputChannel.appendLine(
        `Configuration file not found. Checked paths: ${candidatePaths.join(", ")}`,
      );
      this.config = null;
      this.configPath = null;
      return null;
    }

    this.configPath = selectedPath;

    this.outputChannel.appendLine(
      `Loading configuration from: ${this.configPath}`,
    );

    try {
      const fileContent = fs.readFileSync(this.configPath, "utf8");
      const processedConfig = yaml.load(fileContent) as any;

      // Validate required fields
      if (!this.validateConfig(processedConfig)) {
        vscode.window.showErrorMessage("Invalid .impyla.yml configuration");
        this.config = null;
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
   * Get candidate config paths by priority
   */
  private getCandidateConfigPaths(): string[] {
    const candidatePaths: string[] = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (workspaceFolders && workspaceFolders.length > 0) {
      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      candidatePaths.push(path.join(workspaceRoot, ".impyla.yml"));
    }

    candidatePaths.push(path.join(os.homedir(), ".impyla.yml"));

    return candidatePaths;
  }

  /**
   * Validate configuration structure
   */
  private validateConfig(config: any): boolean {
    if (!config || typeof config !== "object") {
      this.outputChannel.appendLine("Invalid configuration: root must be an object");
      return false;
    }

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

    if (typeof conn.password === "string" && /\$\{[^}]+\}/.test(conn.password)) {
      this.outputChannel.appendLine(
        "Environment variable expansion is no longer supported for connection.password",
      );
      return false;
    }

    if (
      typeof conn.password === "string" &&
      conn.password.startsWith("secret://") &&
      conn.password !== GLOBAL_PASSWORD_POINTER
    ) {
      this.outputChannel.appendLine(
        `Unsupported password pointer: ${conn.password}. Use ${GLOBAL_PASSWORD_POINTER}`,
      );
      return false;
    }

    if (conn.auth_mechanism === "PLAIN" || conn.auth_mechanism === "LDAP") {
      if (!conn.user) {
        this.outputChannel.appendLine(
          "Missing required field for auth: connection.user",
        );
        return false;
      }

      if (!conn.password) {
        this.outputChannel.appendLine(
          "Missing required field for auth: connection.password",
        );
        return false;
      }
    }

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
   * Set up file watchers for auto-reload
   */
  private setupFileWatchers(configPaths: string[]) {
    this.fileWatchers.forEach((watcher) => watcher.dispose());
    this.fileWatchers = [];

    configPaths.forEach((configPath) => {
      const pattern = new vscode.RelativePattern(
        vscode.Uri.file(path.dirname(configPath)),
        path.basename(configPath),
      );
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);

      watcher.onDidChange(() => {
        this.outputChannel.appendLine(
          `Configuration file changed (${configPath}), reloading...`,
        );
        void this.loadConfig();
      });

      watcher.onDidDelete(() => {
        this.outputChannel.appendLine(
          `Configuration file deleted (${configPath}), re-evaluating config source...`,
        );
        void this.loadConfig();
      });

      watcher.onDidCreate(() => {
        this.outputChannel.appendLine(
          `Configuration file created (${configPath}), reloading...`,
        );
        void this.loadConfig();
      });

      this.fileWatchers.push(watcher);
    });
  }

  /**
   * Dispose resources
   */
  dispose() {
    this.fileWatchers.forEach((watcher) => watcher.dispose());
    this.fileWatchers = [];
  }
}
