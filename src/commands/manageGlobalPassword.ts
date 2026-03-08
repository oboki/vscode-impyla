import * as vscode from "vscode";

export const GLOBAL_PASSWORD_SECRET_KEY = "impyla.connection.password.global";

export async function setGlobalPasswordCommand(
  secrets: vscode.SecretStorage,
): Promise<boolean> {
  const password = await vscode.window.showInputBox({
    prompt: "Enter the Impyla global password",
    placeHolder: "Stored securely in VS Code SecretStorage",
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value || !value.trim()) {
        return "Password is required";
      }
      return null;
    },
  });

  if (!password) {
    return false;
  }

  await secrets.store(GLOBAL_PASSWORD_SECRET_KEY, password);
  vscode.window.showInformationMessage("Global password has been saved.");
  return true;
}

export async function clearGlobalPasswordCommand(
  secrets: vscode.SecretStorage,
): Promise<void> {
  const answer = await vscode.window.showWarningMessage(
    "Delete the saved Impyla global password?",
    "Delete",
    "Cancel",
  );

  if (answer !== "Delete") {
    return;
  }

  await secrets.delete(GLOBAL_PASSWORD_SECRET_KEY);
  vscode.window.showInformationMessage("Global password has been deleted.");
}
