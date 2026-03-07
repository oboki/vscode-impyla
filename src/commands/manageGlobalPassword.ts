import * as vscode from "vscode";

export const GLOBAL_PASSWORD_SECRET_KEY = "impyla.connection.password.global";

export async function setGlobalPasswordCommand(
  secrets: vscode.SecretStorage,
): Promise<boolean> {
  const password = await vscode.window.showInputBox({
    prompt: "Impyla 글로벌 비밀번호를 입력하세요",
    placeHolder: "SecretStorage에 안전하게 저장됩니다",
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value || !value.trim()) {
        return "비밀번호를 입력하세요";
      }
      return null;
    },
  });

  if (!password) {
    return false;
  }

  await secrets.store(GLOBAL_PASSWORD_SECRET_KEY, password);
  vscode.window.showInformationMessage("글로벌 비밀번호가 저장되었습니다.");
  return true;
}

export async function clearGlobalPasswordCommand(
  secrets: vscode.SecretStorage,
): Promise<void> {
  const answer = await vscode.window.showWarningMessage(
    "저장된 Impyla 글로벌 비밀번호를 삭제할까요?",
    "삭제",
    "취소",
  );

  if (answer !== "삭제") {
    return;
  }

  await secrets.delete(GLOBAL_PASSWORD_SECRET_KEY);
  vscode.window.showInformationMessage("글로벌 비밀번호가 삭제되었습니다.");
}
