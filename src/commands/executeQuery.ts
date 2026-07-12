import * as vscode from "vscode";
import { ConfigService } from "../services/configService";
import { JinjaService } from "../services/jinjaService";
import { ImpalaService } from "../services/impalaService";
import { PythonEnvironmentService } from "../services/pythonEnvironmentService";
import { ResultsViewProvider } from "../panels/resultsPanel";

const GLOBAL_PASSWORD_POINTER = "secret://global";
const LAZY_LOAD_PAGE_SIZE = 100;
const DEFAULT_LAZY_SESSION_IDLE_TIMEOUT_SECONDS = 120;

let currentLazySessionId: string | undefined;

/**
 * Command to execute SQL query
 */
export async function executeQueryCommand(
  configService: ConfigService,
  jinjaService: JinjaService,
  impalaService: ImpalaService,
  pythonService: PythonEnvironmentService,
  resultsViewProvider: ResultsViewProvider,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const runStartedAt = Date.now();
  const runTag = `run-${runStartedAt}`;
  const log = (message: string): void => {
    outputChannel.appendLine(`[${runTag}] ${message}`);
  };
  const logSection = (title: string): void => {
    outputChannel.appendLine(`[${runTag}] ===== ${title} =====`);
  };

  if (currentLazySessionId) {
    log(`Closing previous lazy session: ${currentLazySessionId}`);
    await impalaService.closeSession(currentLazySessionId);
    currentLazySessionId = undefined;
  }

  resultsViewProvider.setLoadMoreRowsHandler(undefined);

  // Validation
  if (!configService.isConfigLoaded()) {
    log("Aborted: configuration not loaded");
    const answer = await vscode.window.showErrorMessage(
      "No .impyla.yml configuration found. Would you like to create one?",
      "Create Config",
      "Cancel",
    );
    if (answer === "Create Config") {
      vscode.commands.executeCommand("impyla.createConfig");
    }
    return;
  }

  // Check Python dependencies before executing
  const depsReady = await pythonService.checkDependencies();
  if (!depsReady) {
    log("Aborted: Python dependencies unavailable");
    vscode.window.showErrorMessage(
      "Python dependencies not available. Please install impyla and jinja2.",
    );
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    log("Aborted: no active editor");
    vscode.window.showErrorMessage("No active editor");
    return;
  }

  // Get SQL content - use selection if available, otherwise use entire document
  let sqlContent: string;
  const hasSelection = !editor.selection.isEmpty;

  logSection("Run Start");
  log(`Started at: ${new Date(runStartedAt).toISOString()}`);
  
  if (hasSelection) {
    sqlContent = editor.document.getText(editor.selection);
    const startLine = editor.selection.start.line + 1;
    const endLine = editor.selection.end.line + 1;
    log(
      `Executing selected SQL from ${editor.document.fileName}:${startLine}-${endLine}`,
    );
  } else {
    sqlContent = editor.document.getText();
    log(`Executing full document: ${editor.document.fileName}`);
  }

  if (!sqlContent.trim()) {
    log("Aborted: SQL content is empty");
    vscode.window.showErrorMessage("No SQL content to execute");
    return;
  }

  // Create/show results panel early so preparation and template errors are visible in-panel
  await resultsViewProvider.showLoading("Preparing query...");

  // Process Jinja template if detected
  let processedSql = sqlContent;

  if (jinjaService.hasJinjaSyntax(sqlContent)) {
    logSection("Render");
    log("Jinja syntax detected, rendering template...");
    await resultsViewProvider.showLoading("Rendering Jinja template...");

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(
      editor.document.uri,
    );
    const renderResult = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Rendering Jinja template...",
        cancellable: false,
      },
      async () => {
        return await jinjaService.renderTemplate(
          sqlContent,
          workspaceFolder?.uri.fsPath,
        );
      },
    );

    if (!renderResult.success) {
      const errorMsg = renderResult.line
        ? `Template error at line ${renderResult.line}: ${renderResult.error}`
        : `Template error: ${renderResult.error}`;
      await resultsViewProvider.showError(
        errorMsg,
        "TemplateError",
        renderResult.line,
      );
      vscode.window.showErrorMessage(errorMsg);
      log(errorMsg);
      return;
    }

    processedSql = renderResult.rendered;
    log("Template rendered successfully");
  }

  logSection("Executed SQL");
  outputChannel.appendLine(`[${runTag}] ----- SQL Start -----`);
  outputChannel.appendLine(processedSql);
  outputChannel.appendLine(`[${runTag}] ----- SQL End -----`);

  await resultsViewProvider.showLoading("Executing query...");

  const idleTimeoutSeconds =
    configService.getConfig()?.extension?.session_idle_timeout_seconds ||
    DEFAULT_LAZY_SESSION_IDLE_TIMEOUT_SECONDS;

  const supportsLazyPaging = /^(select|with|show|describe|desc|explain|values)\b/i.test(
    processedSql.trim(),
  );
  log(
    `Query mode: ${supportsLazyPaging ? "lazy-session paging" : "single-run"}`,
  );

  // Execute query with cancellation support
  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Executing Impala query...",
      cancellable: true,
    },
    async (progress, token) => {
      return await impalaService.executeQuery(
        processedSql,
        token,
        supportsLazyPaging
          ? {
              pageSize: LAZY_LOAD_PAGE_SIZE,
              idleTimeoutSeconds,
            }
          : undefined,
      );
    },
  );

  // Handle results
  if (result.success) {
    const queryResult = result.result;

    currentLazySessionId = queryResult.sessionId || undefined;
    logSection("Result");
    log(
      `First page received: rows=${queryResult.rowCount}, hasMore=${queryResult.hasMore}, session=${currentLazySessionId || "none"}`,
    );
    // Optional server metadata for diagnostics only; never used for control flow.
    if (queryResult.serverInfo) {
      try {
        log(
          `Server: ${queryResult.serverInfo.host}:${queryResult.serverInfo.port}, db=${queryResult.serverInfo.database}, auth=${queryResult.serverInfo.auth_mechanism}, ssl=${queryResult.serverInfo.use_ssl}`,
        );
        log(
          `Server session idle timeout: ${queryResult.serverInfo.idle_timeout_seconds}s`,
        );
      } catch {
        // Keep metadata logging best-effort only.
      }
    }

    await resultsViewProvider.showResults(queryResult);
    if (supportsLazyPaging) {
      let loadingMore = false;
      resultsViewProvider.setLoadMoreRowsHandler(async (offset) => {
        if (loadingMore || !queryResult.hasMore || !currentLazySessionId) {
          return;
        }

        if (offset !== queryResult.rows.length) {
          log(
            `Ignored lazy-load request at offset=${offset}; currentRows=${queryResult.rows.length}`,
          );
          return;
        }

        loadingMore = true;
        log(`Fetching next page from session=${currentLazySessionId} offset=${offset}`);
        try {
          const nextPage = await impalaService.fetchNextPage(
            currentLazySessionId,
            LAZY_LOAD_PAGE_SIZE,
          );

          if (!nextPage.success) {
            log(`Failed to load next page at offset ${offset}: ${nextPage.error}`);
            vscode.window.showErrorMessage(
              `Failed to load next result page: ${nextPage.error}`,
            );
            queryResult.hasMore = false;
            currentLazySessionId = undefined;
            await resultsViewProvider.showResults(queryResult);
            return;
          }

          if (
            nextPage.result.columns.join("|") !== queryResult.columns.join("|")
          ) {
            vscode.window.showErrorMessage(
              "Result schema changed while loading next page. Stopping lazy load.",
            );
            queryResult.hasMore = false;
            await resultsViewProvider.showResults(queryResult);
            return;
          }

          queryResult.rows.push(...nextPage.result.rows);
          queryResult.rowCount = queryResult.rows.length;
          queryResult.hasMore = nextPage.result.hasMore;
          currentLazySessionId = nextPage.result.sessionId || undefined;
          log(
            `Next page merged: +${nextPage.result.rows.length} rows, total=${queryResult.rowCount}, hasMore=${queryResult.hasMore}, session=${currentLazySessionId || "none"}`,
          );
          if (nextPage.result.serverInfo) {
            try {
              log(
                `Page fetch server time: ${nextPage.result.executionTimeMs}ms (db=${nextPage.result.serverInfo.database})`,
              );
            } catch {
              // Keep metadata logging best-effort only.
            }
          }
          await resultsViewProvider.showResults(queryResult);
        } finally {
          loadingMore = false;
        }
      });
    }

    logSection("Summary");
    log(`Query completed in ${Date.now() - runStartedAt}ms`);

    vscode.window.showInformationMessage(
      `Query executed successfully: ${queryResult.rowCount} rows in ${queryResult.executionTimeMs}ms`,
    );
  } else {
    if (currentLazySessionId) {
      log(`Closing session due to failure: ${currentLazySessionId}`);
      await impalaService.closeSession(currentLazySessionId);
      currentLazySessionId = undefined;
    }

    resultsViewProvider.setLoadMoreRowsHandler(undefined);
    await resultsViewProvider.showError(result.error, result.errorType);
    logSection("Summary");
    log(`Query failed after ${Date.now() - runStartedAt}ms: ${result.error}`);

    const configuredPassword = configService.getConfig()?.connection.password;
    const usesGlobalSecretPointer =
      configuredPassword === GLOBAL_PASSWORD_POINTER;
    const isTSocketReadZeroBytes = /tsocket\s+read\s+0\s+bytes/i.test(
      result.error,
    );
    const isPotentialAuthFailure =
      result.isAuthFailure ||
      /authentication\s+failed|invalid\s+credentials?|login\s+failed|bad\s+credentials?/i.test(
        result.error,
      );

    if (isTSocketReadZeroBytes) {
      const action = await vscode.window.showErrorMessage(
        "Connection was interrupted (TSocket read 0 bytes). This may be caused by authentication failure, network issues, or SASL/TLS mismatches. Verify your credentials and connection settings.",
        ...(usesGlobalSecretPointer
          ? ["Set Global Password", "Open Config File"]
          : ["Open Config File"]),
      );

      if (action === "Set Global Password") {
        await vscode.commands.executeCommand("impyla.setGlobalPassword");
      }
      if (
        action === "Open Config File" &&
        configService.getConfigPath()
      ) {
        const doc = await vscode.workspace.openTextDocument(
          configService.getConfigPath()!,
        );
        await vscode.window.showTextDocument(doc);
      }
      return;
    }

    if (isPotentialAuthFailure && usesGlobalSecretPointer) {
      const action = await vscode.window.showErrorMessage(
        `Possible authentication failure: ${result.error}`,
        "Set Global Password",
        "Open Config File",
      );

      if (action === "Set Global Password") {
        await vscode.commands.executeCommand("impyla.setGlobalPassword");
        return;
      }

      if (action === "Open Config File" && configService.getConfigPath()) {
        const doc = await vscode.workspace.openTextDocument(
          configService.getConfigPath()!,
        );
        await vscode.window.showTextDocument(doc);
        return;
      }
    }

    // Show appropriate error message
    if (result.errorType === "ConnectionError") {
      const answer = await vscode.window.showErrorMessage(
        `Connection error: ${result.error}`,
        "Check Configuration",
      );
      if (answer === "Check Configuration" && configService.getConfigPath()) {
        const doc = await vscode.workspace.openTextDocument(
          configService.getConfigPath()!,
        );
        vscode.window.showTextDocument(doc);
      }
    } else if (result.error.includes("cancelled")) {
      vscode.window.showInformationMessage("Query execution cancelled");
    } else {
      vscode.window.showErrorMessage(`Query failed: ${result.error}`);
    }
  }
}
