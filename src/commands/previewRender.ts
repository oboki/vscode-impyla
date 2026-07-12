import * as vscode from "vscode";
import { JinjaService } from "../services/jinjaService";
import { ResultsViewProvider } from "../panels/resultsPanel";

/**
 * Command to render SQL/Jinja content and preview rendered SQL in the results panel.
 */
export async function previewRenderCommand(
  jinjaService: JinjaService,
  resultsViewProvider: ResultsViewProvider,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor");
    return;
  }

  const hasSelection = !editor.selection.isEmpty;
  const sourceSql = hasSelection
    ? editor.document.getText(editor.selection)
    : editor.document.getText();

  if (!sourceSql.trim()) {
    vscode.window.showErrorMessage("No SQL content to preview");
    return;
  }

  await resultsViewProvider.showLoading("Rendering SQL preview...");

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);

  if (!jinjaService.hasJinjaSyntax(sourceSql)) {
    await resultsViewProvider.showResults({
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
      hasMore: false,
      renderedSql: sourceSql,
    });
    vscode.window.showInformationMessage(
      "No Jinja syntax detected. Showing current SQL as preview.",
    );
    return;
  }

  const startTime = Date.now();
  const renderResult = await jinjaService.renderTemplate(
    sourceSql,
    workspaceFolder?.uri.fsPath,
  );

  if (!renderResult.success) {
    const errorMessage = renderResult.line
      ? `Template error at line ${renderResult.line}: ${renderResult.error}`
      : `Template error: ${renderResult.error}`;

    await resultsViewProvider.showError(
      errorMessage,
      "TemplateError",
      renderResult.line,
    );
    outputChannel.appendLine(errorMessage);
    vscode.window.showErrorMessage(errorMessage);
    return;
  }

  await resultsViewProvider.showResults({
    columns: [],
    rows: [],
    rowCount: 0,
    executionTimeMs: Date.now() - startTime,
    hasMore: false,
    renderedSql: renderResult.rendered,
  });

  outputChannel.appendLine("Rendered SQL preview generated");
  vscode.window.showInformationMessage("Rendered SQL preview updated in panel");
}
