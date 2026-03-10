# Tableau MCP External

## Overview

This repository is an independent MCP server for Tableau environments. It includes the core server,
tooling, and a local UAT-based demo workflow for validating row-level security and authenticated
query behaviour in external environments.

This copy has been prepared for public sharing. Secrets, private tenant identifiers, and
environment-specific setup values must be provided by the operator.

## Quick Start

### Requirements

- Node.js 22.7.5 or newer
- Git
- An MCP client e.g. Claude Desktop, Cursor, VS Code, MCP Inspector, etc.

Clone and build the repository locally:

```bash
git clone https://github.com/larry-tableau/tableau-mcp.git
cd tableau-mcp
npm install
npm run build
```

Then point your MCP client at the built server:

```json
{
  "mcpServers": {
    "tableau": {
      "command": "node",
      "args": ["/absolute/path/to/tableau-mcp/build/index.js"],
      "env": {
        "SERVER": "https://my-tableau-server.com",
        "SITE_NAME": "my_site",
        "PAT_NAME": "my_pat",
        "PAT_VALUE": "pat_value"
      }
    }
  }
}
```

This source-based path is the reproducible deployment route for this public fork. If you later
publish npm packages or GitHub release assets for your fork, you can adapt the client config to
those delivery channels.

## Public UAT Workflow

The repository includes a UAT-based local workflow under `uat/` and the top-level runbooks:

- `RUNBOOK-tableau-mcp-uat.md`
- `RUNBOOK-rls-demo.md`
- `RUNBOOK-rls-customer-repro.md`
- `RUNBOOK-rls-se-quickstart.md`

Use `tests/.env.example` as the starting point for local setup. Replace every placeholder with
values from your own Tableau environment.

## Example Prompts To A Client

### Prompt 1: Querying Data

```
For the Superstore Datasource, what are the top 5 states with the most sales in 2025?
```

### Response

```
Based on the Superstore Datasource, here are the top 5 states with the most sales in 2025:
  1. California - $146,388.34
  2. New York - $93,922.99
  3. Washington - $65,539.90
  4. Texas - $43,421.76
  5. Pennsylvania - $42,688.31
California leads by a significant margin with over $146,000 in sales, followed by New York with nearly $94,000. These two states alone account for a substantial portion of the total sales across the top 5 states.
```

### Prompt 2: Content Exploration

```
Find me the most viewed workbook within the last year.
```

### Response

```
The most viewed workbook within the last year is:

Global Connections
- Owner: John Doe
- Project: Marketing
- Views in last year: 523
- Last Modified: September 2, 2025
- Workbook ID: 111fb672-9401-4913-a167-17b3d89a3e4f
```

### Prompt 3: Getting A View

```
Show me an image of the "Economy" view in the "Finances" project.
```

### Response

![Economy View Image](docs/static/img/economy-view.png)
