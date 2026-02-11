import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

/**
 * Command to create .impyla.yml configuration file
 */
export async function createConfigCommand(
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage("No workspace folder open");
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const configPath = path.join(workspaceRoot, ".impyla.yml");

  // Check if config already exists
  if (fs.existsSync(configPath)) {
    const answer = await vscode.window.showWarningMessage(
      ".impyla.yml already exists. Overwrite?",
      "Overwrite",
      "Cancel",
    );
    if (answer !== "Overwrite") {
      return;
    }
  }

  // Collect configuration details
  const host = await vscode.window.showInputBox({
    prompt: "Enter Impala host",
    placeHolder: "localhost",
    value: "localhost",
  });
  if (!host) {
    return;
  }

  const portInput = await vscode.window.showInputBox({
    prompt: "Enter Impala port",
    placeHolder: "21050",
    value: "21050",
    validateInput: (value) => {
      const num = parseInt(value);
      return isNaN(num) || num < 1 || num > 65535
        ? "Invalid port number"
        : null;
    },
  });
  if (!portInput) {
    return;
  }
  const port = parseInt(portInput);

  const database = await vscode.window.showInputBox({
    prompt: "Enter default database",
    placeHolder: "default",
    value: "default",
  });
  if (!database) {
    return;
  }

  const authMechanism = await vscode.window.showQuickPick(
    ["NOSASL", "PLAIN", "LDAP", "KERBEROS"],
    {
      placeHolder: "Select authentication mechanism",
    },
  );
  if (!authMechanism) {
    return;
  }

  let user: string | undefined;
  let password: string | undefined;

  if (authMechanism === "PLAIN" || authMechanism === "LDAP") {
    user = await vscode.window.showInputBox({
      prompt: "Enter username (or use ${ENV_VAR} syntax)",
      placeHolder: "username or ${IMPALA_USER}",
    });
    if (user === undefined) {
      return;
    }

    password = await vscode.window.showInputBox({
      prompt: "Enter password (or use ${ENV_VAR} syntax)",
      placeHolder: "password or ${IMPALA_PASSWORD}",
      password: true,
    });
    if (password === undefined) {
      return;
    }
  }

  // Generate YAML content
  let yamlContent = `connection:
  host: ${host}
  port: ${port}
  database: ${database}
  auth_mechanism: ${authMechanism}
`;

  if (user) {
    yamlContent += `  user: ${user}\n`;
  }
  if (password) {
    yamlContent += `  password: ${password}\n`;
  }

  yamlContent += `  timeout: 300
  use_ssl: false

jinja:
  plugin_paths: []
  variables: {}

extension:
  max_rows: 10000
  python_path: python3
  auto_preview: true
`;

  // Write to file
  try {
    fs.writeFileSync(configPath, yamlContent, "utf8");
    outputChannel.appendLine(`Configuration file created: ${configPath}`);

    vscode.window.showInformationMessage(
      "Configuration file created successfully",
    );

    // Offer to open file for editing
    const answer = await vscode.window.showInformationMessage(
      ".impyla.yml created. Open for editing?",
      "Open",
      "Later",
    );

    if (answer === "Open") {
      const doc = await vscode.workspace.openTextDocument(configPath);
      await vscode.window.showTextDocument(doc);
    }

    // Suggest reload
    const reloadAnswer = await vscode.window.showInformationMessage(
      "Reload window to apply configuration?",
      "Reload",
      "Later",
    );

    if (reloadAnswer === "Reload") {
      vscode.commands.executeCommand("workbench.action.reloadWindow");
    }
  } catch (error) {
    outputChannel.appendLine(`Error creating configuration: ${error}`);
    vscode.window.showErrorMessage(`Failed to create configuration: ${error}`);
  }
}
