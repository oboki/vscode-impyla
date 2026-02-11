# Impyla Quick Start Guide

Get up and running with Impyla in 5 minutes!

## Step 1: Install Extension

### Option A: From Source (Development)

```bash
cd vscode-impyla
npm install
npm run compile
```

Then press `F5` in VS Code to launch Extension Development Host.

### Option B: From Package

```bash
vsce package
code --install-extension impyla-1.0.0.vsix
```

## Step 2: Install Python Dependencies

```bash
pip install impyla jinja2
```

Or let the extension install them automatically on first use.

## Step 3: Create Configuration

### Method 1: Using Command

1. Open Command Palette (`Cmd+Shift+P` or `Ctrl+Shift+P`)
2. Run: **Impyla: Create Configuration**
3. Follow the prompts

### Method 2: Manual Creation

Create `.impyla.yml` in your workspace root:

```yaml
connection:
  host: your-impala-host
  port: 21050
  database: default
  auth_mechanism: NOSASL

jinja:
  plugin_paths: []
  variables: {}

extension:
  max_rows: 10000
```

## Step 4: Write Your First Query

Create `test.sql`:

```sql
-- Simple query
SELECT * 
FROM my_table 
LIMIT 10;
```

## Step 5: Execute!

1. Open `test.sql`
2. Click **▶ Execute Query** button (appears at top of file)
3. View results in the "Impyla Query Results" panel

## Advanced: Using Templates

### 1. Update Configuration

Edit `.impyla.yml`:

```yaml
jinja:
  variables:
    table_name: users
    status: active
    limit: 50
```

### 2. Create Template Query

Create `template.sql`:

```sql
SELECT *
FROM {{ table_name }}
WHERE status = '{{ status }}'
LIMIT {{ limit }};
```

### 3. Preview Template

Click **👁 Preview Template** to see rendered SQL.

### 4. Execute Template

Click **▶ Execute Query** to run the rendered query.

## Troubleshooting

### Python Not Found

```bash
# Check Python version
python3 --version  # Should be 3.7+

# Or configure path in VS Code settings
{
  "impyla.pythonPath": "/usr/local/bin/python3"
}
```

### Connection Failed

- Verify Impala server is running
- Check host and port in `.impyla.yml`
- Test connection: `telnet your-impala-host 21050`

### View Logs

Run command: **Impyla: Show Output**

## Next Steps

- See [README.md](README.md) for complete documentation
- Check [examples/](examples/) for more query examples
- Read [DEVELOPMENT.md](DEVELOPMENT.md) for development guide
- Explore custom macros in [examples/macros/](examples/macros/)

## Keyboard Shortcuts (Optional)

Add to your `keybindings.json`:

```json
[
  {
    "key": "cmd+shift+e",
    "command": "impyla.executeQuery",
    "when": "editorLangId == sql"
  },
  {
    "key": "cmd+shift+r",
    "command": "impyla.executeSelected",
    "when": "editorLangId == sql && editorHasSelection"
  }
]
```

## Tips

1. **Environment Variables**: Use `${VAR_NAME}` in config for sensitive data
2. **Cancel Queries**: Click the cancel button in the progress notification
3. **Multiple Queries**: Select specific SQL text to execute just that portion
4. **Template Preview**: Always preview complex templates before executing
5. **Custom Macros**: Create reusable Python functions in plugin files

## Example Workflow

```bash
# 1. Clone or create workspace
mkdir my-impala-project && cd my-impala-project

# 2. Create config
cat > .impyla.yml << EOF
connection:
  host: localhost
  port: 21050
  database: default
  auth_mechanism: NOSASL
EOF

# 3. Create query
cat > query.sql << EOF
SELECT * FROM my_table LIMIT 10;
EOF

# 4. Open in VS Code
code .

# 5. Execute query (click button in editor)
```

Happy querying! 🚀
