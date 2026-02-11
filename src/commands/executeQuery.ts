import * as vscode from 'vscode';
import { ConfigService } from '../services/configService';
import { JinjaService } from '../services/jinjaService';
import { ImpalaService } from '../services/impalaService';
import { ResultsPanel } from '../panels/resultsPanel';
import { QueryResult } from '../types';
import { PythonEnvironmentService } from '../services/pythonEnvironmentService'; // Import PythonEnvironmentService

export function registerExecuteQueryCommand(
  context: vscode.ExtensionContext,
  configService: ConfigService,
  jinjaService: JinjaService,
  impalaService: ImpalaService,
  pythonEnvironmentService: PythonEnvironmentService // Add pythonEnvironmentService
) {
  let disposable = vscode.commands.registerCommand('vscode-impyla.executeQuery', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('No active text editor found.');
      return;
    }

    const document = editor.document;
    let queryText: string;

    if (editor.selection.isEmpty) {
      queryText = document.getText();
      vscode.window.showInformationMessage('No selection. Executing entire file...');
    } else {
      queryText = document.getText(editor.selection);
      vscode.window.showInformationMessage('Executing selected query...');
    }

    if (!queryText.trim()) {
      vscode.window.showInformationMessage('No query text to execute.');
      return;
    }

    const config = await configService.loadConfig();
    if (!config) {
      return;
    }

    let renderedSql: string | undefined;
    let finalQuery = queryText;

    if (jinjaService.hasJinjaSyntax(queryText)) {
      vscode.window.showInformationMessage('Jinja syntax detected. Rendering template...');
      const renderResult = await jinjaService.renderTemplate(queryText, config.jinja?.variables);
      if (renderResult.success && renderResult.rendered) {
        finalQuery = renderResult.rendered;
        renderedSql = renderResult.rendered;
        vscode.window.showInformationMessage('Jinja template rendered successfully.');
      } else {
        vscode.window.showErrorMessage(`Jinja rendering failed: ${renderResult.error}`);
        if (renderResult.error?.startsWith('MISSING_MODULE:')) {
          await pythonEnvironmentService.proposeAndInstallMissingPackages(context);
        }
        return;
      }
    }

    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Executing Impala Query',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: 'Sending query to Impala...' });
        const result: QueryResult = await impalaService.executeQuery(finalQuery, config);

        if (result.success) {
          result.renderedSql = renderedSql; // Attach rendered SQL for display
          ResultsPanel.createOrShow(context.extensionUri);
          ResultsPanel.currentPanel?.updateResults(result);
          vscode.window.showInformationMessage('Query executed successfully!');
        } else {
          vscode.window.showErrorMessage(`Impala Query Failed: ${result.error}`);
          if (result.error?.startsWith('MISSING_MODULE:')) {
            await pythonEnvironmentService.proposeAndInstallMissingPackages(context);
          }
        }
      }
    );
  });

  context.subscriptions.push(disposable);
}
