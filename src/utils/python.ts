import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';

/**
 * Determines the effective Python interpreter path.
 * Priority:
 * 1. impyla.pythonPath setting
 * 2. Python from PATH (respects activated virtual environment)
 */
export async function getPythonPath(): Promise<string> {
  console.log('--- getPythonPath: Starting ---');

  // 1. Check impyla.pythonPath setting
  const config = vscode.workspace.getConfiguration('impyla');
  const configuredPath = config.get<string>('pythonPath');
  
  if (configuredPath && configuredPath.trim() !== '') {
    console.log(`1. Using configured pythonPath: ${configuredPath}`);
    
    if (path.isAbsolute(configuredPath)) {
      if (await fileExists(configuredPath)) {
        console.log(`1.1 Configured path exists: ${configuredPath}`);
        return configuredPath;
      } else {
        console.warn(`1.2 Configured path does not exist: ${configuredPath}`);
      }
    } else {
      // It's a command like 'python3' or 'python'
      console.log(`1.3 Using command from config: ${configuredPath}`);
      return configuredPath;
    }
  } else {
    console.log('1. impyla.pythonPath not configured.');
  }

  // 2. Get Python from PATH (this will respect activated virtual environments)
  console.log('2. Checking python3 from PATH...');
  const python3Path = await getPythonFromCommand('python3');
  if (python3Path) {
    console.log(`2.1 Found python3 at: ${python3Path}`);
    return python3Path;
  }

  console.log('2.2 python3 not found, trying python...');
  const pythonPath = await getPythonFromCommand('python');
  if (pythonPath) {
    console.log(`2.3 Found python at: ${pythonPath}`);
    return pythonPath;
  }

  // Fallback
  console.log('3. Falling back to "python3" command');
  return 'python3';
}

async function getPythonFromCommand(command: string): Promise<string | undefined> {
  return new Promise<string | undefined>(resolve => {
    exec(`which ${command}`, (error, stdout, stderr) => {
      if (error || stderr) {
        console.log(`'which ${command}' failed: ${error?.message || stderr}`);
        resolve(undefined);
        return;
      }
      const pythonPath = stdout.trim();
      if (pythonPath && pythonPath.length > 0) {
        resolve(pythonPath);
      } else {
        resolve(undefined);
      }
    });
  });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch (e) {
    return false;
  }
}
