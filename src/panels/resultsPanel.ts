import * as vscode from "vscode";
import * as path from "path";
import { QueryResult } from "../types";

type ResultsPanelMessage =
  | {
      type: "webviewReady";
    }
  | {
      type: "copyToClipboard";
      content: string;
      label?: string;
    }
  | {
      type: "exportData";
      content: string;
      format: "csv" | "tsv" | "json";
      defaultFileName: string;
    }
  | {
      type: "loadMoreRows";
      offset: number;
    };

type ResultsViewState =
  | { kind: "welcome" }
  | { kind: "loading"; message: string }
  | { kind: "error"; error: string; errorType?: string; line?: number }
  | { kind: "results"; result: QueryResult };

type ResultsViewUpdateMessage = {
  type: "updateState";
  state: ResultsViewState;
};

export class ResultsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "impyla.resultsView";
  private static readonly containerCommand = "workbench.view.extension.impylaPanel";

  private webviewView: vscode.WebviewView | undefined;
  private currentState: ResultsViewState = { kind: "welcome" };
  private isWebviewReady = false;
  private pendingReveal = false;
  private onLoadMoreRows:
    | ((offset: number) => Promise<void> | void)
    | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly extensionPath: string) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView;
    this.isWebviewReady = false;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(this.extensionPath, "media"))],
    };

    webviewView.webview.onDidReceiveMessage(
      (message: ResultsPanelMessage) => {
        void this.handleWebviewMessage(message);
      },
      null,
      this.disposables,
    );

    webviewView.onDidChangeVisibility(
      () => {
        if (webviewView.visible) {
          void this.postStateUpdate();
        }
      },
      null,
      this.disposables,
    );

    webviewView.webview.html = this.getShellHtml();

    if (this.pendingReveal) {
      this.pendingReveal = false;
      webviewView.show(true);
    }
  }

  public async showLoading(message: string = "Executing query..."): Promise<void> {
    this.currentState = { kind: "loading", message };
    await this.reveal();
    await this.postStateUpdate();
  }

  public async showError(
    error: string,
    errorType?: string,
    line?: number,
  ): Promise<void> {
    this.currentState = { kind: "error", error, errorType, line };
    await this.reveal();
    await this.postStateUpdate();
  }

  public async showResults(result: QueryResult): Promise<void> {
    this.currentState = { kind: "results", result };
    await this.reveal();
    await this.postStateUpdate();
  }

  public setLoadMoreRowsHandler(
    handler?: (offset: number) => Promise<void> | void,
  ): void {
    this.onLoadMoreRows = handler;
  }

  private async reveal(): Promise<void> {
    if (this.webviewView) {
      this.webviewView.show(true);
      return;
    }

    this.pendingReveal = true;

    try {
      await vscode.commands.executeCommand(ResultsViewProvider.containerCommand);
      await vscode.commands.executeCommand(`${ResultsViewProvider.viewId}.focus`);
    } catch {
      // The view will render current state after the user opens it manually.
    }
  }

  private async postStateUpdate(): Promise<void> {
    if (!this.webviewView || !this.isWebviewReady) {
      return;
    }

    const message: ResultsViewUpdateMessage = {
      type: "updateState",
      state: this.currentState,
    };

    await this.webviewView.webview.postMessage(message);
  }

  private async handleWebviewMessage(message: ResultsPanelMessage): Promise<void> {
    if (!message || typeof message !== "object" || !("type" in message)) {
      return;
    }

    if (message.type === "webviewReady") {
      this.isWebviewReady = true;
      await this.postStateUpdate();
      return;
    }

    if (message.type === "copyToClipboard") {
      await vscode.env.clipboard.writeText(message.content);
      vscode.window.setStatusBarMessage(
        message.label || "Copied results to clipboard",
        2500,
      );
      return;
    }

    if (message.type === "loadMoreRows") {
      if (!this.onLoadMoreRows) {
        return;
      }

      await this.onLoadMoreRows(message.offset);
      return;
    }

    if (message.type !== "exportData") {
      return;
    }

    const filtersByFormat: Record<"csv" | "tsv" | "json", Record<string, string[]>> = {
      csv: { CSV: ["csv"] },
      tsv: { TSV: ["tsv"] },
      json: { JSON: ["json"] },
    };
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    const defaultUri = workspaceRoot
      ? vscode.Uri.joinPath(workspaceRoot, message.defaultFileName)
      : undefined;
    const saveUri = await vscode.window.showSaveDialog({
      defaultUri,
      filters: filtersByFormat[message.format],
      saveLabel: "Export Query Results",
    });

    if (!saveUri) {
      return;
    }

    await vscode.workspace.fs.writeFile(
      saveUri,
      Buffer.from(message.content, "utf8"),
    );

    vscode.window.showInformationMessage(
      `Query results exported to ${path.basename(saveUri.fsPath)}`,
    );
  }

  private getShellHtml(): string {
    const cssPath = this.getWebviewResourceUri("media", "webview.css");
    const webviewJsPath = this.getWebviewResourceUri("media", "webview.js");
    const cspSource = this.getCspSource();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource};">
  <title>Query Results</title>
  <link rel="stylesheet" href="${cssPath}">
</head>
<body>
  <section class="panel-section" id="welcome-view" aria-labelledby="results-welcome-title">
    <div class="section-header">
      <div>
        <h2 class="section-title" id="results-welcome-title">Query Results</h2>
        <p class="section-subtitle">Run "Impyla: Execute Query" to populate this panel with results, errors, and rendered SQL.</p>
      </div>
    </div>
    <div class="empty-state">This panel stays docked with Output and Terminal so you can review results without opening a separate editor tab.</div>
  </section>

  <section id="loading-view" hidden>
    <div class="loading" role="status" aria-live="polite">
      <div class="spinner"></div>
      <p id="loading-message">Executing query...</p>
    </div>
  </section>

  <section class="error" id="error-view" role="alert" aria-live="assertive" hidden>
    <div class="error-header">
      <div>
        <h2 class="section-title">Query failed</h2>
        <p class="section-subtitle">Review the error details below and the Impyla output channel for additional context.</p>
      </div>
      <button class="action-button secondary" id="copy-error-button" type="button">Copy details</button>
    </div>
    <div class="error-meta">
      <span class="badge error-badge" id="error-type-badge" hidden></span>
      <span class="badge" id="error-line-badge" hidden></span>
    </div>
    <pre class="error-message" id="error-message"></pre>
  </section>

  <section id="results-view" hidden>
    <section class="results-stats" aria-label="Query summary">
      <span class="stats-chip"><span class="stats-label">Rows</span><strong id="summary-row-count">0</strong></span>
      <span class="stats-chip"><span class="stats-label">Time</span><strong id="summary-execution-time">0ms</strong></span>
      <span class="stats-chip"><span class="stats-label">Columns</span><strong id="summary-column-count">0</strong></span>
    </section>

    <section class="warning-banner" id="warning-banner" role="status" aria-live="polite" hidden></section>

    <section class="panel-section rendered-sql" id="rendered-sql-section" aria-labelledby="rendered-sql-title" hidden>
      <div class="section-header">
        <div>
          <h2 class="section-title" id="rendered-sql-title">Rendered SQL</h2>
          <p class="section-subtitle" id="rendered-sql-subtitle"></p>
        </div>
        <div class="toolbar-actions">
          <button class="action-button secondary icon-action-button" id="copy-sql-button" type="button" title="Copy SQL" aria-label="Copy SQL">
            ⧉<span class="sr-only">Copy SQL</span>
          </button>
          <button class="action-button secondary icon-action-button" id="toggle-wrap-button" type="button" title="Toggle line wrap" aria-label="Toggle line wrap" aria-pressed="false">
            ↩<span class="sr-only">Toggle line wrap</span>
          </button>
        </div>
      </div>
      <pre class="sql-block" id="rendered-sql-pre"><code class="language-sql" id="rendered-sql-code"></code></pre>
    </section>

    <section class="panel-section results-panel" id="results-data-section" aria-labelledby="results-title">
      <div class="section-header">
        <div>
          <h2 class="section-title" id="results-title">Query results</h2>
        </div>
        <div class="toolbar-actions">
          <button class="action-button secondary icon-action-button" id="copy-page-button" type="button" title="Copy loaded rows" aria-label="Copy loaded rows">⧉<span class="sr-only">Copy loaded rows</span></button>
          <button class="action-button secondary icon-action-button" id="export-csv-button" type="button" title="Export CSV" aria-label="Export CSV">⇩<span class="sr-only">Export CSV</span></button>
          <button class="action-button secondary icon-action-button" id="export-json-button" type="button" title="Export JSON" aria-label="Export JSON">{}<span class="sr-only">Export JSON</span></button>
        </div>
      </div>

      <div class="results-meta" id="results-meta" aria-live="polite"></div>
      <div class="empty-state" id="empty-state" hidden>No rows returned.</div>

      <div class="table-container" id="results-table-container">
        <table id="results-table">
          <caption class="sr-only">Impyla query results</caption>
          <thead id="results-head"></thead>
          <tbody id="results-body"></tbody>
        </table>
      </div>
      <div class="load-more-indicator" id="load-more-indicator" aria-live="polite" hidden>
        Loading more rows...
      </div>
    </section>
  </section>
  <script src="${webviewJsPath}"></script>
</body>
</html>`;
  }

  private getWebviewResourceUri(...segments: string[]): string {
    if (!this.webviewView) {
      return "";
    }

    return this.webviewView.webview.asWebviewUri(
      vscode.Uri.file(path.join(this.extensionPath, ...segments)),
    ).toString();
  }

  private getCspSource(): string {
    return this.webviewView?.webview.cspSource ?? "";
  }
}
