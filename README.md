# Impyla for VS Code

Execute [Apache Impala](https://impala.apache.org/) SQL queries directly from VS Code with Jinja2 templating support.

![Impyla Logo](icon.png)

## Features

- 🚀 **Execute Impala Queries**: Run SQL queries on Impala clusters from VS Code
- 🎨 **Jinja2 Templating**: Use Jinja2 templates in your SQL files with custom variables
- 📊 **Results Panel**: View query results in a dedicated webview panel
- ⚙️ **YAML Configuration**: Manage connection settings and variables in YAML files
- 🐍 **Python Integration**: Automatic detection of Python environment with pip package management

## Installation

### From Marketplace

Search for "Impyla" in the VS Code Extensions marketplace and click Install.

### From Source

```bash
git clone https://github.com/oboki/vscode-impyla.git
cd vscode-impyla
npm install
npm run compile
```

## Requirements

- VS Code 1.80.0 or higher
- Python 3.7+ with pip
- Python packages: `impyla`, `jinja2` (automatically installed if missing)

## Usage

### 1. Configure Impala Connection

Create a `.impyla.yml` file in your workspace root:

```yaml
# Impala connection settings
connection:
  host: your-impala-host.com
  port: 21050
  database: default
  auth_mechanism: PLAIN
  user: your-username
  password: your-password

# Jinja2 template variables (optional)
variables:
  start_date: '2024-01-01'
  end_date: '2024-12-31'
  schema: my_schema
```

### 2. Write SQL with Jinja2 Templates

Create a `.sql` file:

```sql
-- example.sql
SELECT 
    user_id,
    COUNT(*) as total_events
FROM {{ schema }}.events
WHERE event_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'
GROUP BY user_id
ORDER BY total_events DESC
LIMIT 100;
```

### 3. Execute Query

1. Open your `.sql` file
2. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Run command: **Impyla: Execute Query**
4. View results in the Results Panel

## Configuration

### Python Path

By default, the extension auto-detects Python from your PATH. To specify a custom Python interpreter:

1. Open Settings (`Ctrl+,` / `Cmd+,`)
2. Search for "Impyla"
3. Set **Impyla: Python Path** to your Python interpreter path

Example:
- `/path/to/venv/bin/python3` (virtual environment)
- `python3` (system Python)

### Connection Settings

The `.impyla.yml` file supports the following connection options:

```yaml
connection:
  host: string          # Impala host address
  port: integer         # Impala port (default: 21050)
  database: string      # Default database
  auth_mechanism: string # Authentication: NOSASL, PLAIN, GSSAPI, LDAP
  user: string          # Username (for PLAIN/LDAP auth)
  password: string      # Password (for PLAIN/LDAP auth)
  kerberos_service_name: string # For GSSAPI auth
  use_ssl: boolean      # Enable SSL
  ca_cert: string       # SSL certificate path
```

### Template Variables

Define reusable variables in `.impyla.yml`:

```yaml
variables:
  env: production
  region: us-west-2
  table_prefix: analytics_
  
  # Complex variables
  filters:
    - "status = 'active'"
    - "deleted_at IS NULL"
```

Use in SQL:

```sql
SELECT * FROM {{ table_prefix }}users
WHERE region = '{{ region }}'
  AND {{ filters | join(' AND ') }}
```

## Python Environment

The extension manages Python dependencies automatically:

### Virtual Environment (Recommended)

If using a virtual environment:

```bash
# Create and activate venv
python3 -m venv .venv
source .venv/bin/activate  # Linux/Mac
.venv\Scripts\activate     # Windows

# The extension will auto-detect the activated environment
```

### System Python

If pip is not available on system Python, the extension will:
1. Detect the issue
2. Offer to install packages with `--user` flag
3. Allow you to configure a different Python interpreter

## Commands

| Command | Description |
|---------|-------------|
| `Impyla: Execute Query` | Execute the current SQL file on Impala |

## Known Issues

- Large result sets may take time to render in the Results Panel
- Kerberos authentication requires proper system configuration

## Troubleshooting

### "Python does not have pip installed"

**Solution 1**: Use a virtual environment (recommended)
```bash
python3 -m venv .venv
source .venv/bin/activate
```

**Solution 2**: Install pip for your Python
```bash
sudo apt-get install python3-pip  # Ubuntu/Debian
```

**Solution 3**: Configure custom Python path in settings

### "Failed to install impyla"

If you see "externally-managed-environment" error:
- Use a virtual environment (recommended)
- Or install packages manually: `pip install --user impyla jinja2`

### Connection Timeout

- Verify Impala host and port are correct
- Check firewall/network settings
- Ensure authentication credentials are valid

## Development

### Build

```bash
npm install
npm run compile
```

### Watch Mode

```bash
npm run watch
```

### Package Extension

```bash
npm run package
```

This creates a `.vsix` file for distribution.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [impyla](https://github.com/cloudera/impyla) Python library
- Inspired by various SQL extension tools for VS Code
- Impala logo courtesy of Apache Software Foundation

## Support

- 🐛 [Report a Bug](https://github.com/oboki/vscode-impyla/issues)
- 💡 [Request a Feature](https://github.com/oboki/vscode-impyla/issues)
- 📧 Contact: [your-email@example.com](mailto:your-email@example.com)

---

**Enjoy querying Impala from VS Code!** ⚡
