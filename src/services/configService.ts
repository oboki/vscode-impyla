import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { ImpalaConfig } from '../types';

const DEFAULT_IMPYLA_CONFIG_TEMPLATE = `
# Impyla VSCode Extension Configuration
connection:
  host: your_impala_host # REQUIRED
  port: 21050
  database: default
  auth_mechanism: PLAIN # PLAIN, NOSASL, LDAP, KERBEROS
  user: # REQUIRED for PLAIN, LDAP, KERBEROS
  password: # REQUIRED for PLAIN, LDAP
  timeout: 300
  use_ssl: false

jinja:
  plugin_paths:
    # - /path/to/your/jinja/macros
  variables:
    # env: production

extension:
  max_rows: 10000
  python_path: python3 # e.g., python3, /usr/local/bin/python
`;

export class ConfigService {
  private config: ImpalaConfig | undefined;
  private configPath: string | undefined;

  constructor() {}

  public async loadConfig(): Promise<ImpalaConfig | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showWarningMessage('No workspace folder open. Cannot load Impyla configuration.');
      return undefined;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    this.configPath = path.join(workspaceRoot, '.impyla.yml');

    if (!fs.existsSync(this.configPath)) {
      const createConfig = await vscode.window.showInformationMessage(
        '.impyla.yml not found in your workspace. Do you want to create a template?',
        'Yes',
        'No'
      );
      if (createConfig === 'Yes') {
        await fs.promises.writeFile(this.configPath, DEFAULT_IMPYLA_CONFIG_TEMPLATE.trim(), 'utf8');
        vscode.window.showInformationMessage('.impyla.yml created. Please fill in the connection details.');
        // Open the newly created file for the user to edit
        const document = await vscode.workspace.openTextDocument(this.configPath);
        await vscode.window.showTextDocument(document);
      } else {
        vscode.window.showWarningMessage('Impyla extension cannot function without a .impyla.yml configuration file.');
        return undefined;
      }
    }

    try {
      const fileContent = await fs.promises.readFile(this.configPath, 'utf8');
      let parsedConfig = yaml.load(this.substituteEnvVars(fileContent)) as ImpalaConfig;

      // Prompt for essential connection details if missing or placeholder
      parsedConfig = await this.promptForMissingConfig(parsedConfig);

      this.config = parsedConfig;
      return parsedConfig;
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to load .impyla.yml: ${error.message}`);
      return undefined;
    }
  }

  private substituteEnvVars(content: string): string {
    return content.replace(/\${([a-zA-Z_][a-zA-Z0-9_]*)}/g, (match, varName) => {
      return process.env[varName] || '';
    });
  }

  private async promptForMissingConfig(currentConfig: ImpalaConfig): Promise<ImpalaConfig> {
    let configChanged = false;
    const connection = currentConfig.connection || {};

    const requiredFields: { key: keyof ImpalaConfig['connection']; prompt: string; type: 'text' | 'password' | 'choice'; current: any; optional?: boolean; options?: string[]; }[] = [
      { key: 'host', prompt: 'Enter Impala Host:', type: 'text', current: connection.host },
      { key: 'user', prompt: 'Enter Impala User (if required):', type: 'text', current: connection.user, optional: true },
      { key: 'password', prompt: 'Enter Impala Password (if required):', type: 'password', current: connection.password, optional: true },
      { key: 'database', prompt: 'Enter Impala Database (default: default):', type: 'text', current: connection.database || 'default', optional: true },
      { key: 'port', prompt: 'Enter Impala Port (default: 21050):', type: 'text', current: connection.port ? String(connection.port) : '21050', optional: true },
      { key: 'auth_mechanism', prompt: 'Select Auth Mechanism:', type: 'choice', current: connection.auth_mechanism || 'PLAIN', options: ['PLAIN', 'NOSASL', 'LDAP', 'KERBEROS'] },
    ];

    for (const field of requiredFields) {
      let value: string | number | undefined = field.current;
      const isPlaceholder = typeof value === 'string' && (value.startsWith('your_') || value === '' || value === 'default');

      if (isPlaceholder || value === undefined) {
        if (field.type === 'text' || field.type === 'password') {
          const input = await vscode.window.showInputBox({
            prompt: field.prompt,
            value: isPlaceholder ? '' : String(value), // Clear placeholder
            password: field.type === 'password',
            ignoreFocusOut: true,
          });
          if (input !== undefined) { // If user didn't cancel
            value = input;
            configChanged = true;
          } else if (!field.optional && (value === undefined || isPlaceholder)) {
            vscode.window.showWarningMessage(`Impala connection ${field.key} is required. Please edit .impyla.yml manually.`);
            // User cancelled a required field, keep original placeholder or undefined
            value = field.current;
          }
        } else if (field.type === 'choice' && field.options) {
          const quickPickOptions = field.options.map(label => ({ label }));
          const selection = await vscode.window.showQuickPick(quickPickOptions, {
            placeHolder: field.prompt,
            ignoreFocusOut: true,
            canPickMany: false,
          });
          if (selection) {
            value = selection.label; // Correctly get the selected label
            configChanged = true;
          } else if (!field.optional && (value === undefined || isPlaceholder)) {
            vscode.window.showWarningMessage(`Impala connection ${field.key} is required. Please edit .impyla.yml manually.`);
            value = field.current;
          }
        }
      }

      if (value !== undefined) {
        if (field.key === 'port') {
          connection.port = parseInt(value as string, 10);
        } else if (field.key === 'auth_mechanism') {
          connection.auth_mechanism = value as ImpalaConfig['connection']['auth_mechanism'];
        } else if (field.key === 'host') {
          connection.host = value as string;
        } else if (field.key === 'user') {
          connection.user = value as string;
        } else if (field.key === 'password') {
          connection.password = value as string;
        } else if (field.key === 'database') {
          connection.database = value as string;
        }
      }
    }

    if (configChanged && this.configPath) {
      currentConfig.connection = connection; // Ensure the updated connection object is set
      await fs.promises.writeFile(this.configPath, yaml.dump(currentConfig), 'utf8');
      vscode.window.showInformationMessage('.impyla.yml updated with new connection details.');
    }

    return currentConfig;
  }


  public getConfig(): ImpalaConfig | undefined {
    return this.config;
  }
}
