import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import { JinjaRenderResult } from '../types';
import { getPythonPath } from '../utils/python';

export class JinjaService {
  constructor(private extensionPath: string) {}

  public hasJinjaSyntax(sql: string): boolean {
    // Regex to detect Jinja2 syntax: {{ }}, {% %}, {# #}
    const jinjaRegex = /\{\{.*?\}\}|\{%.*?%\}|\{#.*?#\}/s;
    return jinjaRegex.test(sql);
  }

  public async renderTemplate(template: string, configVariables: Record<string, any> = {}): Promise<JinjaRenderResult> {
    const pythonScriptPath = path.join(this.extensionPath, 'python', 'render_jinja.py');
    const pythonPath = await getPythonPath(); // Use centralized function

    return new Promise((resolve) => {
      const child = spawn(pythonPath, [pythonScriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000 // 30 seconds timeout for rendering
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          try {
            const result: JinjaRenderResult = JSON.parse(stdout);
            resolve(result);
          } catch (e: any) {
            resolve({ success: false, error: `Failed to parse Jinja render script output: ${e.message}` });
          }
        } else {
          resolve({ success: false, error: `Jinja render script failed with code ${code}. Error: ${stderr}` });
        }
      });

      child.on('error', (err) => {
        resolve({ success: false, error: `Failed to spawn Jinja render script: ${err.message}` });
      });

      // Send data to stdin
      child.stdin.write(JSON.stringify({ template, variables: configVariables }));
      child.stdin.end();
    });
  }
}
