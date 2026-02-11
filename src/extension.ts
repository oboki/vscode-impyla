import * as vscode from 'vscode';
import { ConfigService } from './services/configService';
import { JinjaService } from './services/jinjaService';
import { ImpalaService } from './services/impalaService';
import { PythonEnvironmentService } from './services/pythonEnvironmentService';
import { registerExecuteQueryCommand } from './commands/executeQuery';
import { ResultsPanel } from './panels/resultsPanel';

export async function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "vscode-impyla" is now active!');

  const configService = new ConfigService();
  const jinjaService = new JinjaService(context.extensionPath);
  const impalaService = new ImpalaService(context.extensionPath);
  const pythonEnvironmentService = new PythonEnvironmentService();

  // Load config first for python path and other settings
  const config = await configService.loadConfig();
  if (config) {
    // Propose and install missing packages
    await pythonEnvironmentService.proposeAndInstallMissingPackages(context);
  }

  // Register commands
  registerExecuteQueryCommand(context, configService, jinjaService, impalaService, pythonEnvironmentService); // Pass pythonEnvironmentService

  // Handle opening ResultsPanel if it's already there
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer(ResultsPanel.viewType, {
      async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
        console.log(`Restoring Impyla Results Panel: ${state}`);
        webviewPanel.title = 'Impyla Query Results';
        ResultsPanel.currentPanel = new ResultsPanel(webviewPanel, context.extensionUri);
      }
    })
  );
}

export function deactivate() {}
