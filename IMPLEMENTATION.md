# Implementation Summary

This document reflects the current implementation status of the Impyla VS Code extension.

## Current Scope

- Execute Impala SQL from `.sql` files via Command Palette.
- If a selection exists, execute selection; otherwise execute entire document.
- Render Jinja templates during execution and show rendered SQL in results.
- Display results/errors in a webview panel without stealing editor focus.
- Manage `.impyla.yml` configuration and Python dependency checks.

## Current Source Structure

```text
src/
├── extension.ts
├── commands/
│   ├── executeQuery.ts
│   └── createConfig.ts
├── panels/
│   └── resultsPanel.ts
├── services/
│   ├── configService.ts
│   ├── impalaService.ts
│   ├── jinjaService.ts
│   └── pythonEnvironmentService.ts
└── types/
    └── index.ts
```

```text
python/
├── execute_query.py
├── render_jinja.py
└── requirements.txt
```

## Registered Commands

- `impyla.executeQuery`
- `impyla.createConfig`
- `impyla.showOutput`

## Notable Runtime Behaviors

- Query results panel opens/reuses beside editor with focus preserved in editor.
- Query result serialization handles non-integer numeric values safely (e.g., `Decimal`).
- Jinja rendering errors and query execution errors are surfaced in results/notifications.

## Removed Entry Points

- SQL CodeLens execution entry points were removed.
- Execution is intentionally Command Palette centric.

## Build Status

- TypeScript compile target: `npm run compile`
- Python runtime scripts communicate with extension via JSON stdin/stdout.

## Documentation Alignment

Primary user/developer artifacts are maintained in:

- `README.md`
- `QUICKSTART.md`
- `DEVELOPMENT.md`
- `TESTING.md`
- `CHANGELOG.md`
