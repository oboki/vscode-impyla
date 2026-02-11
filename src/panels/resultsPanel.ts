import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { QueryResult } from "../types";

/**
 * Panel for displaying query results in a webview
 */
export class ResultsPanel {
  public static currentPanel: ResultsPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private extensionPath: string,
  ) {
    this.panel = panel;

    // Set initial HTML content
    this.panel.webview.html = this.getLoadingHtml();

    // Handle panel disposal
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  /**
   * Create or show the results panel
   */
  public static createOrShow(extensionPath: string): ResultsPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;

    // If we already have a panel, show it
    if (ResultsPanel.currentPanel) {
      ResultsPanel.currentPanel.panel.reveal(column);
      return ResultsPanel.currentPanel;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      "impylaResults",
      "Impyla Query Results",
      column,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(extensionPath, "media")),
          vscode.Uri.file(path.join(extensionPath, "node_modules")),
        ],
      },
    );

    ResultsPanel.currentPanel = new ResultsPanel(panel, extensionPath);
    return ResultsPanel.currentPanel;
  }

  /**
   * Show loading state
   */
  public showLoading(message: string = "Executing query...") {
    this.panel.webview.html = this.getLoadingHtml(message);
  }

  /**
   * Show error state
   */
  public showError(error: string, errorType?: string) {
    this.panel.webview.html = this.getErrorHtml(error, errorType);
  }

  /**
   * Show query results
   */
  public showResults(result: QueryResult) {
    this.panel.webview.html = this.getResultsHtml(result);
  }

  /**
   * Dispose the panel
   */
  public dispose() {
    ResultsPanel.currentPanel = undefined;

    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  /**
   * Get HTML for loading state
   */
  private getLoadingHtml(message: string = "Executing query..."): string {
    const cssPath = this.panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(this.extensionPath, "media", "webview.css")),
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Query Results</title>
  <link rel="stylesheet" href="${cssPath}">
</head>
<body>
  <div class="loading">
    <div class="spinner"></div>
    <p>${this.escapeHtml(message)}</p>
  </div>
</body>
</html>`;
  }

  /**
   * Get HTML for error state
   */
  private getErrorHtml(error: string, errorType?: string): string {
    const cssPath = this.panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(this.extensionPath, "media", "webview.css")),
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Query Error</title>
  <link rel="stylesheet" href="${cssPath}">
</head>
<body>
  <div class="error">
    ${errorType ? `<div class="error-type">${this.escapeHtml(errorType)}</div>` : ""}
    <div class="error-message">${this.escapeHtml(error)}</div>
  </div>
</body>
</html>`;
  }

  /**
   * Get HTML for results display
   */
  private getResultsHtml(result: QueryResult): string {
    const cssPath = this.panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(this.extensionPath, "media", "webview.css")),
    );

    const highlightCssPath = this.panel.webview.asWebviewUri(
      vscode.Uri.file(
        path.join(this.extensionPath, "node_modules", "highlight.js", "styles", "vs2015.min.css")
      )
    );

    // Inline highlight.js for offline/closed network environments
    const highlightCorePath = path.join(this.extensionPath, "node_modules", "highlight.js", "lib", "core.js");
    const highlightSqlPath = path.join(this.extensionPath, "node_modules", "highlight.js", "lib", "languages", "sql.js");
    const highlightCoreJs = fs.readFileSync(highlightCorePath, "utf8");
    const highlightSqlJs = fs.readFileSync(highlightSqlPath, "utf8");

    const rowsHtml = result.rows
      .map((row) => {
        const cellsHtml = row
          .map((cell) => `<td>${this.escapeHtml(this.formatCell(cell))}</td>`)
          .join("");
        return `<tr>${cellsHtml}</tr>`;
      })
      .join("");

    const renderedSqlHtml = result.renderedSql
      ? `<details class="rendered-sql">
          <summary><h3>Rendered SQL:</h3></summary>
          <pre><code class="language-sql">${this.escapeHtml(result.renderedSql)}</code></pre>
         </details>`
      : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Query Results</title>
  <link rel="stylesheet" href="${cssPath}">
  <link rel="stylesheet" href="${highlightCssPath}">
</head>
<body>
  <details class="info-section">
    <summary><h3>Query Info:</h3></summary>
    <div class="info-content">
      <div class="info-item">
        <span class="label">Rows:</span>
        <span class="value">${result.rowCount}${result.hasMore ? " (limited)" : ""}</span>
      </div>
      <div class="info-item">
        <span class="label">Execution Time:</span>
        <span class="value">${result.executionTimeMs}ms</span>
      </div>
    </div>
  </details>
  
  ${renderedSqlHtml}
  
  <details class="results-section" open>
    <summary><h3>Result:</h3></summary>
    <div class="table-container">
    <table>
      <thead>
        <tr>
          ${result.columns.map((col) => `<th>${this.escapeHtml(col)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
    </div>
  </details>

  <script>
    (function() {
      // Create module system for CommonJS compatibility
      let module = { exports: {} };
      let exports = module.exports;

      ${highlightCoreJs}
      const hljs = module.exports;

      module = { exports: {} };
      exports = module.exports;

      ${highlightSqlJs}
      const sqlLang = module.exports;

      hljs.registerLanguage('sql', sqlLang);
      hljs.highlightAll();
    })();
  </script>
</body>
</html>`;
  }

  /**
   * Format a cell value for display
   */
  private formatCell(value: any): string {
    if (value === null || value === undefined) {
      return "NULL";
    }
    return String(value);
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}
