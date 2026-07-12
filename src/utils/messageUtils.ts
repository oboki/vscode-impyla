import * as vscode from "vscode";

const MODAL_MESSAGE_OPTIONS: vscode.MessageOptions = {
  modal: false,
};

export function showModalErrorMessage(
  message: string,
  ...items: string[]
): Thenable<string | undefined> {
  return vscode.window.showErrorMessage(
    message,
    MODAL_MESSAGE_OPTIONS,
    ...items,
  );
}

export function showModalWarningMessage(
  message: string,
  ...items: string[]
): Thenable<string | undefined> {
  return vscode.window.showWarningMessage(
    message,
    MODAL_MESSAGE_OPTIONS,
    ...items,
  );
}

export function showModalInformationMessage(
  message: string,
  ...items: string[]
): Thenable<string | undefined> {
  return vscode.window.showInformationMessage(
    message,
    MODAL_MESSAGE_OPTIONS,
    ...items,
  );
}