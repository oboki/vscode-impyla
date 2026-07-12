# Impyla Quick Start Guide

Get up and running with Impyla in 5 minutes!

## Minimal Local Impala (Recommended for First Test)

If you do not already have an Impala cluster, the fastest path is a single-node
Docker quickstart using prebuilt Apache images.

### Prerequisites

- Docker and Docker Compose plugin (`docker compose`)
- ~8GB RAM available for containers (Impala daemon uses a 4GB memory limit)

### Start Local Impala

```bash
# 1) Prepare helper directory
mkdir -p .local-impala-quickstart/quickstart_conf

# 2) Download compose and config files from Apache Impala
curl -fsSL https://raw.githubusercontent.com/apache/impala/master/docker/quickstart.yml \
  -o .local-impala-quickstart/quickstart.yml
curl -fsSL https://raw.githubusercontent.com/apache/impala/master/docker/quickstart_conf/hive-site.xml \
  -o .local-impala-quickstart/quickstart_conf/hive-site.xml

# 3) Create required Docker network (no-op if already exists)
docker network inspect quickstart-network >/dev/null 2>&1 || \
  docker network create -d bridge quickstart-network

# 4) Start single-node Impala (prebuilt images)
cd .local-impala-quickstart
QUICKSTART_LISTEN_ADDR=0.0.0.0 \
IMPALA_QUICKSTART_IMAGE_PREFIX='apache/impala:4.5.0-' \
docker compose -f quickstart.yml up -d
```

### Verify Engine

```bash
QUICKSTART_IP=$(docker network inspect quickstart-network -f '{{(index .IPAM.Config 0).Gateway}}')
docker run --rm --network=quickstart-network \
  apache/impala:4.5.0-impala_quickstart_client \
  impala-shell -i "$QUICKSTART_IP" -q "select 1 as ok"
```

You should see one row with value `1`.

### Use With This Extension

Set your `.impyla.yml` connection values to:

```yaml
connection:
  host: localhost
  port: 21050
  database: default
  auth_mechanism: NOSASL
```

### Stop Local Impala

```bash
cd .local-impala-quickstart
QUICKSTART_LISTEN_ADDR=0.0.0.0 docker compose -f quickstart.yml down
```

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
code --install-extension impyla-0.1.1.vsix
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

Config lookup order is:
1. Workspace `.impyla.yml`
2. `~/.impyla.yml` fallback

For PLAIN/LDAP authentication, password can be either plaintext or `secret://global`.

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
2. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
3. Run: **Impyla: Execute Query (Selection or Entire Document)**
4. View results in the "Impyla Query Results" panel

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

### 3. Execute Template

Run **Impyla: Execute Query (Selection or Entire Document)** from Command Palette.

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
- If using `secret://global`, run **Impyla: Set Global Password**
- `TSocket read 0 bytes` can be auth/network/protocol related, so verify credentials too

### View Logs

Run command: **Impyla: Show Output**

## Next Steps

- See [README.md](README.md) for complete documentation
- Check [examples/](examples/) for more query examples
- Read [DEVELOPMENT.md](DEVELOPMENT.md) for development guide
- Explore custom macros in [examples/macros/](examples/macros/)

## Tips

1. **Password Options**: Use plaintext or `secret://global` in `.impyla.yml`
2. **Cancel Queries**: Click the cancel button in the progress notification
3. **Multiple Queries**: Select specific SQL text to execute just that portion
4. **Template Validation**: Verify variables/macros in `.impyla.yml` before execution
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

# 5. Execute query (Command Palette)
```

Happy querying! 🚀
