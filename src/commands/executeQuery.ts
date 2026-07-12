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
  if (currentLazySessionId) {
    await impalaService.closeSession(currentLazySessionId);
    currentLazySessionId = undefined;
  }

  resultsViewProvider.setLoadMoreRowsHandler(undefined);

  // Validation
  if (!configService.isConfigLoaded()) {
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
    vscode.window.showErrorMessage(
      "Python dependencies not available. Please install impyla and jinja2.",
    );
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor");
    return;
  }

  // Get SQL content - use selection if available, otherwise use entire document
  let sqlContent: string;
  const hasSelection = !editor.selection.isEmpty;
  
  if (hasSelection) {
    sqlContent = editor.document.getText(editor.selection);
    outputChannel.appendLine("Executing selected SQL...");
  } else {
    sqlContent = editor.document.getText();
    outputChannel.appendLine("Executing entire document...");
  }

  if (!sqlContent.trim()) {
    vscode.window.showErrorMessage("No SQL content to execute");
    return;
  }

  // Create/show results panel early so preparation and template errors are visible in-panel
  await resultsViewProvider.showLoading("Preparing query...");

  // Process Jinja template if detected
  let processedSql = sqlContent;
  let renderedSql: string | undefined;

  if (jinjaService.hasJinjaSyntax(sqlContent)) {
    outputChannel.appendLine("Jinja syntax detected, rendering template...");
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
      outputChannel.appendLine(errorMsg);
      return;
    }

    processedSql = renderResult.rendered;
    renderedSql = renderResult.rendered;
    outputChannel.appendLine("Template rendered successfully");
  }

  await resultsViewProvider.showLoading("Executing query...");

  const idleTimeoutSeconds =
    configService.getConfig()?.extension?.session_idle_timeout_seconds ||
    DEFAULT_LAZY_SESSION_IDLE_TIMEOUT_SECONDS;

  const supportsLazyPaging = /^(select|with|show|describe|desc|explain|values)\b/i.test(
    processedSql.trim(),
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
    if (renderedSql) {
      queryResult.renderedSql = renderedSql;
    }

    currentLazySessionId = queryResult.sessionId || undefined;

    await resultsViewProvider.showResults(queryResult);
    if (supportsLazyPaging) {
      let loadingMore = false;
      resultsViewProvider.setLoadMoreRowsHandler(async (offset) => {
        if (loadingMore || !queryResult.hasMore || !currentLazySessionId) {
          return;
        }

        if (offset !== queryResult.rows.length) {
          return;
        }

        loadingMore = true;
        try {
          const nextPage = await impalaService.fetchNextPage(
            currentLazySessionId,
            LAZY_LOAD_PAGE_SIZE,
          );

          if (!nextPage.success) {
            outputChannel.appendLine(
              `Failed to load next page at offset ${offset}: ${nextPage.error}`,
            );
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
          await resultsViewProvider.showResults(queryResult);
        } finally {
          loadingMore = false;
        }
      });
    }

    vscode.window.showInformationMessage(
      `Query executed successfully: ${queryResult.rowCount} rows in ${queryResult.executionTimeMs}ms`,
    );
  } else {
    if (currentLazySessionId) {
      await impalaService.closeSession(currentLazySessionId);
      currentLazySessionId = undefined;
    }

    resultsViewProvider.setLoadMoreRowsHandler(undefined);
    await resultsViewProvider.showError(result.error, result.errorType);

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
