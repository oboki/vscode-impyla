# Installation and Development Guide

## Prerequisites

- Node.js 18.x or higher
- npm 8.x or higher
- Python 3.7 or higher
- VS Code 1.80.0 or higher

## Building the Extension

### 1. Clone and Install Dependencies

```bash
cd vscode-impyla
npm install
```

### 2. Compile TypeScript

```bash
npm run compile
```

For development with auto-recompilation:

```bash
npm run watch
```

### 3. Install Python Dependencies

```bash
pip install -r python/requirements.txt
```

Or let the extension install them automatically on first use.

## Running the Extension

### Method 1: Debug in VS Code

1. Open the project in VS Code
2. Press `F5` to launch the Extension Development Host
3. A new VS Code window will open with the extension loaded

### Method 2: Package and Install

```bash
# Install vsce (VS Code Extension Manager)
npm install -g @vscode/vsce

# Package the extension
vsce package

# Install the .vsix file
code --install-extension impyla-1.0.0.vsix
```

## Testing the Extension

### 1. Create Configuration

In the Extension Development Host window:

1. Open a folder as workspace
2. Run command: **Impyla: Create Configuration**
3. Follow the prompts to create `.impyla.yml`

Or manually create `.impyla.yml`:

```yaml
connection:
  host: localhost
  port: 21050
  database: default
  auth_mechanism: NOSASL

jinja:
  plugin_paths: []
  variables: {}

extension:
  max_rows: 10000
```

### 2. Create a SQL File

Create `test.sql`:

```sql
SELECT * FROM my_table LIMIT 10;
```

### 3. Execute Query

- Use Command Palette: **Impyla: Execute Query (Selection or Entire Document)**
- Results will appear in the "Impyla Query Results" panel

### 4. Test Jinja Templates

Create `template.sql`:

```sql
SELECT * FROM {{ table_name }} LIMIT {{ limit }};
```

Update `.impyla.yml`:

```yaml
jinja:
  variables:
    table_name: users
    limit: 50
```

- Run **Impyla: Execute Query (Selection or Entire Document)** from Command Palette
- Confirm rendered SQL in the results panel

## Project Structure

```
vscode-impyla/
├── src/                    # TypeScript source code
│   ├── extension.ts        # Extension entry point
│   ├── types/              # Type definitions
│   ├── services/           # Business logic services
│   ├── commands/           # Command implementations
│   ├── panels/             # Webview panels
│   └── providers/          # (currently unused)
├── python/                 # Python scripts
│   ├── execute_query.py    # Query execution
│   ├── render_jinja.py     # Template rendering
│   └── requirements.txt    # Python dependencies
├── media/                  # Webview assets
│   └── webview.css         # Results panel styles
├── examples/               # Example files
│   ├── simple_query.sql
│   ├── template_query.sql
│   ├── advanced_template.sql
│   └── macros/             # Example macros
├── out/                    # Compiled JavaScript (generated)
├── .vscode/                # VS Code config
│   ├── launch.json         # Debug configuration
│   └── tasks.json          # Build tasks
├── package.json            # Extension manifest
├── tsconfig.json           # TypeScript config
└── README.md               # Documentation
```

## Development Workflow

### 1. Make Changes

Edit TypeScript files in `src/` or Python files in `python/`

### 2. Recompile

If not using watch mode:

```bash
npm run compile
```

### 3. Reload Extension

In the Extension Development Host window:
- Press `Cmd+R` (Mac) or `Ctrl+R` (Windows/Linux)
- Or use Command Palette: **Developer: Reload Window**

### 4. Check Logs

- View extension output: **Impyla: Show Output**
- Check Debug Console in the main VS Code window
- View webview console: Right-click in results panel > Inspect

## Debugging

### TypeScript Debugging

1. Set breakpoints in `.ts` files
2. Press `F5` to start debugging
3. Breakpoints will hit in the Extension Development Host

### Python Debugging

Add print statements or use logging:

```python
import sys
print(f"Debug: {variable}", file=sys.stderr)
```

View in Extension Output channel.

### Webview Debugging

1. In results panel, right-click > **Inspect**
2. DevTools will open for the webview
3. Debug HTML/CSS issues

## Common Issues

### Extension Not Activating

- Check that a SQL file is open
- View output channel for errors
- Ensure TypeScript compiled successfully

### Python Not Found

- Verify Python 3.7+ is installed
- Check `impyla.pythonPath` setting
- View output channel for Python detection logs

### Query Execution Fails

- Verify Impala server is running
- Check `.impyla.yml` configuration
- Test connection manually: `python python/execute_query.py`

### Template Rendering Fails

- Check Jinja syntax
- Verify plugin paths exist
- View output channel for rendering errors

## Publishing

### Prepare for Publishing

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Test thoroughly
4. Ensure README.md is complete

### Package Extension

```bash
vsce package
```

### Publish to Marketplace

```bash
vsce publish
```

Or publish manually via [VS Code Marketplace](https://marketplace.visualstudio.com/).

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Submit a pull request

## License

MIT
