import * as vscode from 'vscode';
import { QueryResult } from '../types';

export class ResultsPanel {
  public static currentPanel: ResultsPanel | undefined;
  public static readonly viewType = 'impylaResults';

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it.
    if (ResultsPanel.currentPanel) {
      ResultsPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
      ResultsPanel.viewType,
      'Impyla Query Results',
      column || vscode.ViewColumn.One,
      {
        // Enable javascript in the webview
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
      }
    );

    ResultsPanel.currentPanel = new ResultsPanel(panel, extensionUri);
  }

  private _extensionUri: vscode.Uri;

  public constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programmatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public updateResults(results: QueryResult) {
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview, results);
  }

  public dispose() {
    ResultsPanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _update() {
    const webview = this._panel.webview;
    this._panel.webview.html = this._getHtmlForWebview(webview, {
      success: true,
      data: [],
      columns: [],
      rowCount: 0,
      executionTime: 0,
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview, results: QueryResult) {
    // Local path to css for the webview
    const styleResetUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css')
    );
    const styleVSCodeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css')
    );
    const styleMainUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css')
    );

    let content = '';
    if (!results.success) {
      content = `<p class="error">Error: ${this.escapeHtml(results.error || 'Unknown error')}</p>`;
    } else {
      if (results.renderedSql) {
        content += `
          <details>
            <summary>Rendered SQL</summary>
            <pre><code>${this.escapeHtml(results.renderedSql)}</code></pre>
          </details>
        `;
      }
      if (results.data && results.data.length > 0) {
        const tableHeaders = results.columns
          ? results.columns.map((col) => `<th>${this.escapeHtml(col)}</th>`).join('')
          : '';
        const tableRows = results.data
          .map(
            (row) =>
              `<tr>${Object.values(row)
                .map((cell) => `<td>${this.escapeHtml(String(cell))}</td>`)
                .join('')}</tr>`
          )
          .join('');
        content += `
          <p>Rows: ${results.rowCount}, Time: ${results.executionTime}ms</p>
          <table>
            <thead>
              <tr>${tableHeaders}</tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        `;
      } else {
        content += `<p>No data returned.</p>`;
      }
    }

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link href="${styleResetUri}" rel="stylesheet">
          <link href="${styleVSCodeUri}" rel="stylesheet">
          <link href="${styleMainUri}" rel="stylesheet">
          <title>Impyla Query Results</title>
      </head>
      <body>
          ${content}
      </body>
      </html>`;
  }

  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
