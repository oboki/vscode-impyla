# Impyla VSCode Extension

Execute Impala queries directly from VS Code with Jinja2 templating support.

## Features

- 🚀 Execute Impala SQL queries from `.sql` files
- 📝 Jinja2 template support with custom Python macros
- 📊 View query results in an integrated panel
- 🔍 Preview template rendering before execution
- ⚙️ Configuration via `.impyla.yml`
- 🔐 Support for multiple authentication mechanisms
- 💡 CodeLens integration for quick query execution

## Requirements

- Python 3.7 or higher
- Python packages: `impyla`, `jinja2` (auto-installed by extension)
- Access to an Impala server

## Getting Started

### 1. Install the Extension

Install from the VS Code marketplace or build from source.

### 2. Create Configuration

Create a `.impyla.yml` file in your workspace root:

```yaml
connection:
  host: localhost
  port: 21050
  database: default
  auth_mechanism: NOSASL
  timeout: 300

jinja:
  plugin_paths: []
  variables: {}

extension:
  max_rows: 10000
  python_path: python3
```

Or use the command palette: **Impyla: Create Configuration**

### 3. Write SQL Queries

Create a `.sql` file with your query:

```sql
SELECT * FROM my_table
LIMIT 10;
```

### 4. Execute Queries

- Click the **▶ Execute Query** button in the editor
- Use command palette: **Impyla: Execute Query**
- Use keyboard shortcut (configurable)

## Jinja2 Templates

Impyla supports Jinja2 templating in SQL files:

```sql
SELECT *
FROM {{ table_name }}
WHERE date >= '{{ start_date }}'
  AND date <= '{{ end_date }}'
LIMIT {{ limit }};
```

Configure variables in `.impyla.yml`:

```yaml
jinja:
  variables:
    table_name: my_table
    start_date: 2024-01-01
    end_date: 2024-12-31
    limit: 100
```

### Custom Macros

Create Python files with custom Jinja functions:

```python
# macros/date_utils.py
from datetime import datetime, timedelta

def days_ago(n):
    """Get date N days ago"""
    return (datetime.now() - timedelta(days=n)).strftime('%Y-%m-%d')

def format_date(date_str, fmt='%Y-%m-%d'):
    """Format a date string"""
    dt = datetime.strptime(date_str, fmt)
    return dt.strftime('%Y-%m-%d')
```

Reference in `.impyla.yml`:

```yaml
jinja:
  plugin_paths:
    - macros/date_utils.py
```

Use in SQL:

```sql
SELECT *
FROM events
WHERE event_date >= '{{ days_ago(7) }}'
```

## Commands

- **Impyla: Execute Query** - Execute entire SQL file
- **Impyla: Execute Selected** - Execute selected SQL
- **Impyla: Preview Template** - Preview Jinja rendering
- **Impyla: Create Configuration** - Setup wizard for `.impyla.yml`
- **Impyla: Show Output** - Show extension output channel

## Configuration

### Connection Settings

```yaml
connection:
  host: string              # Impala server hostname
  port: number              # Impala server port (default: 21050)
  database: string          # Default database
  auth_mechanism: string    # NOSASL, PLAIN, LDAP, or KERBEROS
  user: string             # Username (for PLAIN/LDAP)
  password: string         # Password (for PLAIN/LDAP)
  timeout: number          # Query timeout in seconds
  use_ssl: boolean         # Use SSL connection
  ca_cert: string          # Path to CA certificate
```

### Environment Variables

Use `${VAR_NAME}` syntax for sensitive data:

```yaml
connection:
  user: ${IMPALA_USER}
  password: ${IMPALA_PASSWORD}
```

## Authentication

Supported mechanisms:

- **NOSASL** - No authentication (default)
- **PLAIN** - Username/password
- **LDAP** - LDAP authentication
- **KERBEROS** - Kerberos authentication

## Extension Settings

- `impyla.maxRows` - Maximum rows to fetch (default: 10000)
- `impyla.autoPreview` - Auto-preview templates (default: true)
- `impyla.pythonPath` - Python executable path (default: python3)

## Troubleshooting

### Python Not Found

Ensure Python 3.7+ is installed and in your PATH, or configure:

```json
{
  "impyla.pythonPath": "/path/to/python3"
}
```

### Missing Dependencies

The extension will prompt to install `impyla` and `jinja2` automatically. Or install manually:

```bash
pip install impyla jinja2
```

### Connection Issues

- Verify Impala server is running and accessible
- Check host, port, and authentication settings in `.impyla.yml`
- Review extension output channel for detailed error messages

## Examples

See the `.impyla.yml.example` file for a complete configuration template.

## License

MIT

## Contributing

Contributions welcome! Please submit issues and pull requests on GitHub.
