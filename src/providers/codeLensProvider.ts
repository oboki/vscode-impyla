import * as vscode from "vscode";
import { JinjaService } from "../services/jinjaService";

/**
 * CodeLens provider for SQL files
 */
export class SqlCodeLensProvider implements vscode.CodeLensProvider {
  private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses =
    this.onDidChangeCodeLensesEmitter.event;

  constructor(private jinjaService: JinjaService) {}

  /**
   * Provide CodeLens items for SQL files
   */
  provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    const topOfDocument = new vscode.Range(0, 0, 0, 0);

    // Execute Query button
    codeLenses.push(
      new vscode.CodeLens(topOfDocument, {
        title: "▶ Execute Query",
        command: "impyla.executeQuery",
        tooltip: "Execute SQL (selection if available, otherwise entire document)",
      }),
    );

    return codeLenses;
  }

  /**
   * Refresh CodeLens
   */
  refresh(): void {
    this.onDidChangeCodeLensesEmitter.fire();
  }
}
