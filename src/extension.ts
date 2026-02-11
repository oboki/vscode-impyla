import * as vscode from "vscode";
import { ConfigService } from "./services/configService";
import { PythonEnvironmentService } from "./services/pythonEnvironmentService";
import { JinjaService } from "./services/jinjaService";
import { ImpalaService } from "./services/impalaService";
import { SqlCodeLensProvider } from "./providers/codeLensProvider";
import { executeQueryCommand } from "./commands/executeQuery";
import { createConfigCommand } from "./commands/createConfig";

let outputChannel: vscode.OutputChannel;
let configService: ConfigService;
let pythonService: PythonEnvironmentService;
let jinjaService: JinjaService;
let impalaService: ImpalaService;
let codeLensProvider: SqlCodeLensProvider;
let configPromptShown = false;

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext) {
  // Create output channel
  outputChannel = vscode.window.createOutputChannel("Impyla");
  outputChannel.appendLine("Impyla extension activating...");

  // Initialize services
  configService = new ConfigService(outputChannel);
  pythonService = new PythonEnvironmentService(outputChannel);
  jinjaService = new JinjaService(
    pythonService,
    configService,
    outputChannel,
    context.extensionPath,
  );
  impalaService = new ImpalaService(
    pythonService,
    configService,
    outputChannel,
    context.extensionPath,
  );

  // Check Python availability
  const pythonPath = await pythonService.findPython();
  if (!pythonPath) {
    vscode.window
      .showErrorMessage(
        "Python 3.7+ not found. Please install Python and ensure it is in your PATH.",
        "Learn More",
      )
      .then((selection) => {
        if (selection === "Learn More") {
          vscode.env.openExternal(
            vscode.Uri.parse("https://www.python.org/downloads/"),
          );
        }
      });
    outputChannel.appendLine("ERROR: Python not found");
  } else {
    outputChannel.appendLine(`Python found: ${pythonPath}`);

    // Check dependencies in background (non-blocking)
    pythonService.checkDependencies().then((success) => {
      if (success) {
        outputChannel.appendLine("Python dependencies verified");
      } else {
        outputChannel.appendLine(
          "Python dependencies missing or not installed",
        );
      }
    });
  }

  // Load configuration (non-blocking)
  configService.loadConfig().then((config) => {
    if (config) {
      outputChannel.appendLine("Configuration loaded successfully");
    } else {
      outputChannel.appendLine(
        "No configuration found - user can create one with impyla.createConfig",
      );
      // Only show prompt once per session
      if (!configPromptShown) {
        configPromptShown = true;
        vscode.window
          .showInformationMessage(
            "No .impyla.yml found. Create configuration?",
            "Create Config",
            "Later",
          )
          .then((answer) => {
            if (answer === "Create Config") {
              vscode.commands.executeCommand("impyla.createConfig");
            }
          });
      }
    }
  });

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("impyla.executeQuery", () => {
      executeQueryCommand(
        configService,
        jinjaService,
        impalaService,
        pythonService,
        outputChannel,
        context.extensionPath,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("impyla.createConfig", () => {
      createConfigCommand(outputChannel);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("impyla.showOutput", () => {
      outputChannel.show();
    }),
  );

  // Register CodeLens provider
  codeLensProvider = new SqlCodeLensProvider(jinjaService);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: "sql", scheme: "file" },
      codeLensProvider,
    ),
  );
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: "sql", scheme: "untitled" },
      codeLensProvider,
    ),
  );

  // Setup event listeners
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && editor.document.languageId === "sql") {
        outputChannel.appendLine(
          `Opened SQL file: ${editor.document.fileName}`,
        );
        codeLensProvider.refresh();
      }
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(() => {
      // Refresh CodeLens when selection changes
      codeLensProvider.refresh();
    }),
  );

  // Reload configuration when workspace folders change
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      outputChannel.appendLine(
        "Workspace folders changed, reloading configuration...",
      );
      configPromptShown = false; // Reset prompt flag
      configService.loadConfig().then((config) => {
        if (config) {
          outputChannel.appendLine("Configuration reloaded successfully");
        } else {
          outputChannel.appendLine("No configuration found in new workspace");
        }
      });
    }),
  );

  // Create status bar item
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBarItem.text = "$(database) Impyla";
  statusBarItem.tooltip = "Impyla SQL Runner";
  statusBarItem.command = "impyla.showOutput";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Add ConfigService to subscriptions for disposal
  context.subscriptions.push(configService);

  outputChannel.appendLine("Impyla extension activated successfully");
}

/**
 * Extension deactivation
 */
export function deactivate() {
  if (outputChannel) {
    outputChannel.appendLine("Impyla extension deactivating...");
    outputChannel.dispose();
  }
}
