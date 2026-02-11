# Change Log

All notable changes to the "Impyla" extension will be documented in this file.

## [1.0.0] - 2026-02-13

### Initial Release

#### Features

- **Query Execution**
  - Execute Impala SQL queries directly from `.sql` files
  - Execute full file or selected text
  - Results displayed in integrated webview panel
  - Support for cancellation of long-running queries
  - Display execution time and row count

- **Jinja2 Templating**
  - Automatic detection of Jinja2 syntax in SQL files
  - Variable substitution from configuration
  - Custom Python macro support via plugin system
  - Template preview before execution
  - Error reporting with line numbers

- **Configuration Management**
  - YAML-based configuration (`.impyla.yml`)
  - Environment variable substitution
  - Auto-reload on configuration changes
  - Guided setup wizard
  - Support for multiple authentication mechanisms

- **Python Integration**
  - Automatic Python environment detection
  - Dependency checking and installation
  - Support for Python 3.7+
  - Cross-platform compatibility

- **UI/UX**
  - CodeLens integration for quick execution
  - Status bar indicator
  - Output channel for diagnostics
  - Syntax-aware query results display
  - Responsive webview panels

- **Security**
  - Environment variable support for credentials
  - SSL/TLS connection support
  - Secure credential handling

#### Supported Authentication
- NOSASL (no authentication)
- PLAIN (username/password)
- LDAP
- KERBEROS

#### Commands
- `impyla.executeQuery` - Execute entire SQL file
- `impyla.executeSelected` - Execute selected SQL
- `impyla.previewTemplate` - Preview Jinja rendering
- `impyla.createConfig` - Create configuration file
- `impyla.showOutput` - Show extension output

#### Configuration Options
- `impyla.maxRows` - Maximum rows to fetch (default: 10000)
- `impyla.autoPreview` - Auto-preview templates (default: true)
- `impyla.pythonPath` - Python executable path (default: python3)

#### Examples Included
- Simple query example
- Template query with variables
- Advanced template with custom macros
- Date utility macros

### Known Issues

- None at this time

### Future Enhancements

Planned for future releases:
- Query history
- Query performance profiling
- Schema browsing
- Auto-completion for table/column names
- Multiple result tabs
- Export results to CSV/JSON
- Syntax highlighting for Jinja in SQL
- Saved query snippets
