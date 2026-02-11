# Testing Checklist

Use this checklist to verify all extension functionality works correctly.

## Prerequisites
- [ ] VS Code 1.80.0+ installed
- [ ] Python 3.7+ installed and in PATH
- [ ] Node.js and npm installed
- [ ] Extension compiled successfully (`npm run compile`)

## Installation Testing

### Development Mode
- [ ] Open project in VS Code
- [ ] Press F5 to launch Extension Development Host
- [ ] New VS Code window opens
- [ ] No errors in Debug Console
- [ ] Extension shows in Extensions list

### Output Channel
- [ ] Run command "Impyla: Show Output"
- [ ] Output channel appears with "Impyla extension activating..." message
- [ ] Python detection logged
- [ ] No error messages

### Status Bar
- [ ] Status bar shows "$(database) Impyla" on left side
- [ ] Clicking it opens the output channel

## Configuration Testing

### Create Config Command
- [ ] Open a workspace folder
- [ ] Run command "Impyla: Create Configuration"
- [ ] Wizard prompts for host
- [ ] Wizard prompts for port (validates number)
- [ ] Wizard prompts for database
- [ ] Wizard prompts for auth mechanism (quick pick)
- [ ] If PLAIN/LDAP: prompts for username and password
- [ ] File `.impyla.yml` created in workspace root
- [ ] Offer to open file appears
- [ ] Offer to reload window appears

### Manual Config
- [ ] Create `.impyla.yml` manually
- [ ] File watcher detects changes
- [ ] Configuration reloaded (check output channel)
- [ ] Invalid config shows error message

### Environment Variables
- [ ] Set environment variable: `export TEST_VAR=test_value`
- [ ] Use `${TEST_VAR}` in config
- [ ] Variable is substituted correctly (check in rendered SQL or logs)

## Python Environment Testing

### Python Detection
- [ ] Extension finds Python executable
- [ ] Version 3.7+ detected
- [ ] Python path logged in output channel

### Dependency Checking
- [ ] If impyla not installed: shows warning
- [ ] If jinja2 not installed: shows warning
- [ ] Option to install packages appears
- [ ] Installation works when confirmed
- [ ] Success message appears after installation

### Custom Python Path
- [ ] Set `impyla.pythonPath` in settings
- [ ] Extension uses custom path
- [ ] Path logged in output channel

## Query Execution Testing

### Simple Query
- [ ] Create `test.sql` with simple SELECT
- [ ] CodeLens "▶ Execute Query" appears
- [ ] Click execute button
- [ ] Progress notification appears
- [ ] Results panel opens
- [ ] Results displayed in table
- [ ] Execution time shown
- [ ] Row count shown
- [ ] No errors

### Execute Selected
- [ ] Select portion of SQL
- [ ] CodeLens "▶ Execute Selected" appears
- [ ] Click button
- [ ] Only selected SQL executes
- [ ] Results displayed correctly

### Error Handling
- [ ] Execute invalid SQL
- [ ] Error shown in results panel
- [ ] Error type identified (SQLSyntaxError)
- [ ] Error message displayed

### Connection Error
- [ ] Use invalid host in config
- [ ] Execute query
- [ ] Connection error shown
- [ ] "Check Configuration" button appears
- [ ] Clicking opens config file

### Query Cancellation
- [ ] Execute long-running query
- [ ] Click cancel in progress notification
- [ ] Query cancelled
- [ ] "Query execution cancelled" message shown
- [ ] No error popup

### Large Result Set
- [ ] Execute query returning > max_rows
- [ ] Results limited to max_rows
- [ ] "has_more" indicator shown
- [ ] Warning about limited results

## Template Testing

### Jinja Detection
- [ ] Create SQL with `{{ variable }}`
- [ ] CodeLens "👁 Preview Template" appears
- [ ] Jinja syntax detected in output channel

### Preview Template
- [ ] Click "👁 Preview Template"
- [ ] Preview panel opens
- [ ] Rendered SQL displayed
- [ ] No errors

### Variable Substitution
- [ ] Add variables to config jinja.variables
- [ ] Use variables in SQL template
- [ ] Preview shows substituted values
- [ ] Execute runs substituted query
- [ ] "Rendered SQL" section appears in results

### Template Errors
- [ ] Use undefined variable
- [ ] Error shown in preview panel
- [ ] Error type: UndefinedError
- [ ] Error message clear

### Syntax Errors
- [ ] Create template with syntax error (e.g., `{% if %}`)
- [ ] Preview shows error
- [ ] Line number displayed
- [ ] Error type: TemplateSyntaxError

## Custom Macros Testing

### Plugin Loading
- [ ] Create Python file with functions
- [ ] Add to jinja.plugin_paths
- [ ] Functions available in templates
- [ ] Loaded plugins listed in preview panel

### Macro Usage
- [ ] Use example date_utils.py
- [ ] Call `days_ago(7)` in template
- [ ] Preview shows correct date
- [ ] Execute works correctly

### Plugin Errors
- [ ] Use invalid plugin path
- [ ] Warning logged but no failure
- [ ] Other plugins still load

### Directory Plugins
- [ ] Add directory to plugin_paths
- [ ] All .py files loaded
- [ ] __init__.py skipped
- [ ] Functions from all files available

## UI/UX Testing

### Results Panel
- [ ] Panel title: "Impyla Query Results"
- [ ] Opens beside editor
- [ ] Table with headers
- [ ] Rows display correctly
- [ ] NULL values styled differently
- [ ] Alternating row colors
- [ ] Hover highlighting
- [ ] Horizontal scroll for wide tables

### Preview Panel
- [ ] Panel title: "Jinja Template Preview"
- [ ] Opens beside editor
- [ ] Pre-formatted SQL display
- [ ] Loaded plugins section
- [ ] Syntax highlighting (via CSS)

### Theme Integration
- [ ] Switch to light theme
- [ ] Colors update correctly
- [ ] Switch to dark theme
- [ ] Colors update correctly
- [ ] Custom themes work

### Loading States
- [ ] Spinner shows during execution
- [ ] Loading message displayed
- [ ] Panel not empty before results

## Settings Testing

### max_rows Setting
- [ ] Set `impyla.maxRows` to 5
- [ ] Execute query with 10+ rows
- [ ] Only 5 rows returned
- [ ] has_more flag set

### autoPreview Setting
- [ ] Set `impyla.autoPreview` to false
- [ ] Open template file
- [ ] Preview not automatic
- [ ] Manual preview still works

### pythonPath Setting
- [ ] Set custom python path
- [ ] Extension uses custom path
- [ ] Works correctly

## Examples Testing

### Simple Query Example
- [ ] Open examples/simple_query.sql
- [ ] Execute successfully
- [ ] Results display

### Template Query Example
- [ ] Open examples/template_query.sql
- [ ] Configure variables in examples/.impyla.yml
- [ ] Preview renders correctly
- [ ] Execute successfully

### Advanced Template Example
- [ ] Open examples/advanced_template.sql
- [ ] Load macros from examples/macros/
- [ ] Preview shows macro expansion
- [ ] Execute successfully

## Edge Cases

### Empty Query
- [ ] Create empty SQL file
- [ ] Execute shows error: "No SQL content to execute"

### No Active Editor
- [ ] Close all editors
- [ ] Run execute command
- [ ] Error: "No active editor"

### No Workspace
- [ ] Open single file (not in workspace)
- [ ] Execute shows error about missing workspace

### Multiple Workspaces
- [ ] Open multiple workspace folders
- [ ] Uses first workspace for config
- [ ] Config from correct workspace loaded

### File Changes
- [ ] Open SQL file
- [ ] Make changes
- [ ] Execute uses current content (not saved)

### Config File Deletion
- [ ] Delete .impyla.yml while extension running
- [ ] File watcher detects deletion
- [ ] Config becomes null
- [ ] Execute shows config missing error

## Performance Testing

### Large Results
- [ ] Execute query returning max_rows (10000)
- [ ] Results load without freeze
- [ ] UI remains responsive

### Long Query
- [ ] Execute query taking 30+ seconds
- [ ] Progress indicator shows
- [ ] Can cancel
- [ ] Results appear after completion

### Multiple Executions
- [ ] Execute multiple queries in sequence
- [ ] Each completes successfully
- [ ] No memory leaks
- [ ] Results panel updates correctly

## Cross-Platform Testing

### Linux
- [ ] All tests pass on Linux
- [ ] Python detection works
- [ ] File paths correct

### macOS
- [ ] All tests pass on macOS
- [ ] Python detection works
- [ ] File paths correct

### Windows
- [ ] All tests pass on Windows
- [ ] Python detection works (py, python, python3)
- [ ] File paths with backslashes work
- [ ] Line endings handled correctly

## Documentation Testing

### README
- [ ] Examples work as documented
- [ ] Commands listed correctly
- [ ] Configuration schema accurate
- [ ] Screenshots/examples clear

### QUICKSTART
- [ ] Can follow from scratch
- [ ] All steps work
- [ ] Commands correct

### DEVELOPMENT
- [ ] Build instructions work
- [ ] Debug setup works
- [ ] Troubleshooting helpful

## Regression Testing

After any changes:
- [ ] Re-run all core tests
- [ ] No new errors introduced
- [ ] Existing functionality still works

## Final Verification

- [ ] No console errors in Debug Console
- [ ] No errors in output channel
- [ ] Extension activates correctly
- [ ] All commands work
- [ ] All features functional
- [ ] Documentation accurate
- [ ] Examples work
- [ ] Ready for release

## Test Results

Date: ___________
Tester: ___________
Version: 1.0.0

Summary:
- Tests Passed: _____ / _____
- Tests Failed: _____ / _____
- Critical Issues: _____
- Minor Issues: _____

Notes:
