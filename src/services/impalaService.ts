import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import { ImpalaConfig, QueryResult } from '../types';
import { getPythonPath } from '../utils/python';

export class ImpalaService {
  constructor(private extensionPath: string) {}

  public async executeQuery(sql: string, config: ImpalaConfig): Promise<QueryResult> {
    const pythonScriptPath = path.join(this.extensionPath, 'python', 'execute_query.py');
    const pythonPath = await getPythonPath(); // Use centralized function

    return new Promise((resolve) => {
      const child = spawn(pythonPath, [pythonScriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60000 // 60 seconds timeout for query execution
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
            const result: QueryResult = JSON.parse(stdout);
            resolve(result);
          } catch (e: any) {
            resolve({ success: false, error: `Failed to parse Impala query script output: ${e.message}` });
          }
        } else {
          resolve({ success: false, error: `Impala query script failed with code ${code}. Error: ${stderr}` });
        }
      });

      child.on('error', (err) => {
        resolve({ success: false, error: `Failed to spawn Impala query script: ${err.message}` });
      });

      // Send data to stdin
      child.stdin.write(JSON.stringify({ sql, config }));
      child.stdin.end();
    });
  }
}
