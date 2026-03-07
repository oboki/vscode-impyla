import * as vscode from "vscode";
import { ConfigService } from "../services/configService";
import { JinjaService } from "../services/jinjaService";
import { ImpalaService } from "../services/impalaService";
import { PythonEnvironmentService } from "../services/pythonEnvironmentService";
import { ResultsPanel } from "../panels/resultsPanel";

const GLOBAL_PASSWORD_POINTER = "secret://global";

/**
 * Command to execute SQL query
 */
export async function executeQueryCommand(
  configService: ConfigService,
  jinjaService: JinjaService,
  impalaService: ImpalaService,
  pythonService: PythonEnvironmentService,
  outputChannel: vscode.OutputChannel,
  extensionPath: string,
): Promise<void> {
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

  // Process Jinja template if detected
  let processedSql = sqlContent;
  let renderedSql: string | undefined;

  if (jinjaService.hasJinjaSyntax(sqlContent)) {
    outputChannel.appendLine("Jinja syntax detected, rendering template...");

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
      vscode.window.showErrorMessage(errorMsg);
      outputChannel.appendLine(errorMsg);
      return;
    }

    processedSql = renderResult.rendered;
    renderedSql = renderResult.rendered;
    outputChannel.appendLine("Template rendered successfully");
  }

  // Create/show results panel
  const resultsPanel = ResultsPanel.createOrShow(extensionPath);
  resultsPanel.showLoading("Executing query...");

  // Execute query with cancellation support
  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Executing Impala query...",
      cancellable: true,
    },
    async (progress, token) => {
      return await impalaService.executeQuery(processedSql, token);
    },
  );

  // Handle results
  if (result.success) {
    const queryResult = result.result;
    if (renderedSql) {
      queryResult.renderedSql = renderedSql;
    }
    resultsPanel.showResults(queryResult);
    vscode.window.showInformationMessage(
      `Query executed successfully: ${queryResult.rowCount} rows in ${queryResult.executionTimeMs}ms`,
    );
  } else {
    resultsPanel.showError(result.error, result.errorType);

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
        "연결이 중단되었습니다 (TSocket read 0 bytes). 인증 실패, 네트워크 이슈, SASL/TLS 설정 불일치 등에서 발생할 수 있습니다. 현재 환경에서는 인증 정보 확인도 권장됩니다.",
        ...(usesGlobalSecretPointer
          ? ["글로벌 비밀번호 변경", "구성 파일 열기"]
          : ["구성 파일 열기"]),
      );

      if (action === "글로벌 비밀번호 변경") {
        await vscode.commands.executeCommand("impyla.setGlobalPassword");
      }
      if (
        action === "구성 파일 열기" &&
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
        `인증 실패 가능성이 있습니다: ${result.error}`,
        "글로벌 비밀번호 변경",
        "구성 파일 열기",
      );

      if (action === "글로벌 비밀번호 변경") {
        await vscode.commands.executeCommand("impyla.setGlobalPassword");
        return;
      }

      if (action === "구성 파일 열기" && configService.getConfigPath()) {
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
