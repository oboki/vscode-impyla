import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { getPythonPath } from '../utils/python';

export class PythonEnvironmentService {
  constructor() {}

  /**
   * Checks if impyla and jinja2 are installed and offers to install them if missing.
   */
  public async proposeAndInstallMissingPackages(extensionContext: vscode.ExtensionContext): Promise<void> {
    const pythonPath = await getPythonPath();
    console.log(`Using Python: ${pythonPath}`);

    const missingPackages: string[] = [];

    const [impylaInstalled, jinja2Installed] = await Promise.all([
      this.checkPythonModule(pythonPath, 'impyla'),
      this.checkPythonModule(pythonPath, 'jinja2')
    ]);

    if (!impylaInstalled) {
      missingPackages.push('impyla');
    }
    if (!jinja2Installed) {
      missingPackages.push('jinja2');
    }

    if (missingPackages.length === 0) {
      console.log('All required packages installed.');
      return;
    }

    console.log(`Missing packages: ${missingPackages.join(', ')}`);

    // Check if pip is available
    const pipAvailable = await this.checkPipAvailable(pythonPath);
    if (!pipAvailable) {
      const action = await vscode.window.showErrorMessage(
        `Python at '${pythonPath}' does not have pip installed. Please install pip or configure a different Python interpreter.`,
        'Configure Python Path'
      );
      
      if (action === 'Configure Python Path') {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'impyla.pythonPath');
      }
      return;
    }

    // Determine if we're in a virtual environment
    const isVenv = await this.isVirtualEnvironment(pythonPath);
    console.log(`Virtual environment: ${isVenv}`);

    // Offer installation
    const packageList = missingPackages.join(', ');
    const installMsg = isVenv 
      ? `Missing packages: ${packageList}. Install now?`
      : `Missing packages: ${packageList}. Install with --user flag?`;

    const action = await vscode.window.showWarningMessage(
      installMsg,
      'Install Now',
      'Configure Python Path',
      'Cancel'
    );

    if (action === 'Install Now') {
      const useUserFlag = !isVenv;
      await this.installPackages(pythonPath, missingPackages, useUserFlag);
    } else if (action === 'Configure Python Path') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'impyla.pythonPath');
    }
  }

  private async checkPythonModule(pythonPath: string, moduleName: string): Promise<boolean> {
    return new Promise(resolve => {
      const child = spawn(pythonPath, ['-c', `import ${moduleName}`], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          child.kill();
          console.warn(`Timeout checking module '${moduleName}'`);
          resolve(false);
        }
      }, 5000);

      child.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          const installed = code === 0;
          console.log(`Module '${moduleName}': ${installed ? 'installed' : 'not found'}`);
          resolve(installed);
        }
      });

      child.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          console.error(`Failed to check module ${moduleName}: ${err.message}`);
          resolve(false);
        }
      });
    });
  }

  private async checkPipAvailable(pythonPath: string): Promise<boolean> {
    return new Promise(resolve => {
      const child = spawn(pythonPath, ['-m', 'pip', '--version'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          child.kill();
          console.warn('Timeout checking pip');
          resolve(false);
        }
      }, 5000);

      child.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(code === 0);
        }
      });

      child.on('error', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(false);
        }
      });
    });
  }

  private async isVirtualEnvironment(pythonPath: string): Promise<boolean> {
    return new Promise(resolve => {
      const child = spawn(pythonPath, ['-c', 'import sys; print(hasattr(sys, "real_prefix") or (hasattr(sys, "base_prefix") and sys.base_prefix != sys.prefix))'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let output = '';
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          child.kill();
          resolve(false);
        }
      }, 5000);

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(code === 0 && output.trim() === 'True');
        }
      });

      child.on('error', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(false);
        }
      });
    });
  }

  private async installPackages(pythonPath: string, packages: string[], useUserFlag: boolean): Promise<void> {
    const args = ['-m', 'pip', 'install'];
    if (useUserFlag) {
      args.push('--user');
    }
    args.push(...packages);

    console.log(`Installing: ${pythonPath} ${args.join(' ')}`);

    return new Promise(resolve => {
      const child = spawn(pythonPath, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
        console.log(data.toString());
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error(data.toString());
      });

      child.on('close', (code) => {
        if (code === 0) {
          vscode.window.showInformationMessage(
            `Successfully installed ${packages.join(', ')}. Please reload the window.`,
            'Reload Now',
            'Later'
          ).then((action) => {
            if (action === 'Reload Now') {
              vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
          });
          resolve();
        } else {
          const combinedOutput = output + errorOutput;
          let errorMsg = `Failed to install packages.`;

          if (combinedOutput.includes('externally-managed-environment')) {
            errorMsg = 'Python is externally managed. Please use a virtual environment or install pip packages manually.';
          } else if (combinedOutput.includes('Permission denied')) {
            errorMsg = 'Permission denied. Please use a virtual environment or install pip packages manually.';
          }

          console.error('Install error:', combinedOutput);
          vscode.window.showErrorMessage(errorMsg);
          resolve();
        }
      });

      child.on('error', (err) => {
        console.error(`Failed to run pip: ${err.message}`);
        vscode.window.showErrorMessage(`Failed to run pip: ${err.message}`);
        resolve();
      });
    });
  }
}
