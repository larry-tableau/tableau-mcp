# Tableau MCP + RLS — SE Quickstart

> *Same question. Different answers. Enforced by Tableau.*
>
> Two people ask an AI assistant the same question. They get different answers — not because
> the application filtered the data, but because Tableau Cloud enforced the security policy
> at the data layer before any result left the server. This guide gets you to that moment.

---

## What You'll Build

| What | Detail |
|------|--------|
| **The demo** | Two users query the same AI-connected datasource. Creator sees West + South. Viewer sees East + Central. Identical queries. Different data. |
| **What it proves** | Tableau's Row-Level Security travels with every AI query — enforced at the data layer, not in the application |
| **Time to complete** | ~45 min (first time) · ~5 min once set up |

---

## Before You Begin: Access Checklist

Confirm all five before starting Phase 0.

- [ ] **Node.js** — version 22 or higher (we'll install this in Phase 0 if needed)
- [ ] **Tableau Cloud site admin** — Creator or Administrator role on the demo site
- [ ] **Tableau Cloud Manager (TCM) cloud admin** — access to `https://cloudmanager.tableau.com`
  *(separate from your Tableau Cloud site — if you can't sign in there, see the note below)*
- [ ] **Two demo email addresses** — e.g. `creator-user@example.com` and `viewer-user@example.com`

> **Don't have TCM cloud admin access?**
> TCM is Tableau's tenant-management layer — separate from Tableau Cloud itself. If you can't
> sign in at `https://cloudmanager.tableau.com`, contact your Tableau administrator or
> Tableau IT team and request Tableau Cloud Manager cloud administrator access. Your Tableau
> Cloud site admin access does not grant this automatically.

---

## Phase 0 — System Setup *(one-time, ~10 min)*

Skip any step where you already have the tool installed. Verify with the check command.

### Step 0.1 — Install Node.js

Node.js is the runtime that executes this server. You need version 22 or higher.

**Check first:**
```bash
node --version
```
If the output shows `v22.x.x` or higher, skip to Step 0.2.

**macOS (recommended — using Homebrew):**
```bash
brew install node@22
```
If you don't have Homebrew: download the macOS installer from `https://nodejs.org/en/download`
and run it. Select the **LTS** release.

**Verify:**
```bash
node --version   # must show v22.x.x or higher
npm --version    # must show 10.x.x or higher
```

---

### Step 0.2 — Clone the Repository

Clone your public repository copy and change into the project directory:

```bash
git clone https://github.com/larry-tableau/tableau-mcp.git
cd tableau-mcp
```

---

### Step 0.3 — Install Dependencies

From inside the `tableau-mcp-external` directory:

```bash
npm install
```

This downloads all required packages. It takes about 60 seconds on first run. You will see a
progress bar and a summary line like `added 312 packages`. That is normal.

---

## Phase 1 — Tableau Cloud Setup *(~20 min)*

All steps in Phase 1 are done in your **Tableau Cloud browser UI**. No terminal needed.

### Step 1.1 — Create Two Demo Users

In **Tableau Cloud → Users → Add Users**, create (or identify) two accounts:

| Role | Suggested email pattern | Tableau site role |
|------|------------------------|-------------------|
| Creator demo user | `creator-user@example.com` | **Creator** |
| Viewer demo user | `viewer-user@example.com` | **Viewer** |

> Any two testable email addresses work. Use aliases or mailbox rules if you want both demo
> users to land in one inbox.

**Record both email addresses.** You will use them in the Data Policy (Step 1.3) and in your
configuration file (Step 2.3).

---

### Step 1.2 — Create a Virtual Connection

A Virtual Connection is what enables Tableau's Data Policies. You cannot enforce per-user row
filtering on a regular published datasource — the policy must be attached to a Virtual Connection.

1. In Tableau Cloud, go to **Explore → New → Virtual Connection**
2. Connect to **Tableau Samples → Superstore** (available on most sites as a built-in sample),
   or any datasource you have access to that contains a column to filter on
3. In the editor, add the **Orders** table (the table containing the `Region` column)
4. Click **Publish** → name it something recognisable, e.g. `Superstore with RLS Policies`

> **Why Virtual Connection, not a regular datasource?**
> `USERNAME()` in a regular datasource filter returns `null` through the VizQL Data Service API —
> queries return 0 rows for all users regardless of configuration. Only a Virtual Connection Data
> Policy evaluates `USERNAME()` server-side with the correct authenticated user identity.
> This is confirmed empirically and documented by Tableau. See the comparison table in
> `RUNBOOK-rls-customer-repro.md` for full details.

---

### Step 1.3 — Configure the Data Policy

Still inside the Virtual Connection editor (or re-open via **Tableau Cloud → Virtual Connections**):

1. Click the **Data Policies** tab
2. Click **New Policy** → name it `rls_entitlement`
3. In **Step 1: Add tables and columns to map**, select the **Orders** table and add **Region**
   as the policy column
4. In **Step 2: Write a policy condition**, paste the following — replacing both email addresses
   with your actual demo user emails from Step 1.1:

```sql
(
  LOWER(USERNAME()) = 'creator-user@example.com'
  AND (
    [Region] = 'West'
    OR [Region] = 'South'
  )
)
OR
(
  LOWER(USERNAME()) = 'viewer-user@example.com'
  AND (
    [Region] = 'East'
    OR [Region] = 'Central'
  )
)
```

5. Confirm **"Calculation is valid"** appears below the editor
6. Click **Save**, then **Publish** the Virtual Connection

> **Why `LOWER(USERNAME())`?** Tableau Cloud usernames are email addresses. Some identity
> providers send the email in mixed case. `LOWER()` makes the match case-insensitive, which is
> more reliable across customer environments.

---

### Step 1.4 — Publish a Datasource Through the Virtual Connection

The demo datasource must connect through the Virtual Connection — not directly to the
underlying database. This is what makes the Data Policy apply.

1. In Tableau Cloud, go to **Explore → New → Published Data Source**
2. Under the **Virtual Connections** tab, find and select the Virtual Connection you published
   in Step 1.2
3. Select the **Orders** table
4. Click **Publish** → name it `Sample - Superstore with VC policies`
5. **Copy the datasource LUID** from the URL on the datasource page:
   ```
   https://<pod>.online.tableau.com/#/site/<site>/datasources/[THIS IS THE LUID]/details
   ```

**Record this LUID.** It is a string of letters and numbers separated by hyphens. You will need
it in Step 2.3 and it is required to run the validation script.

---

### Step 1.5 — Grant API Access Permission

Both demo users need **API Access** on the published datasource. View and Connect permissions
alone are not sufficient — VizQL Data Service queries require API Access explicitly.

1. Open the datasource in Tableau Cloud → click **Actions → Permissions**
2. Add both demo users with:
   - **View**: Allow
   - **Connect**: Allow
   - **API Access**: Allow

> Without API Access, queries return **0 rows with no error message**. The API gives no
> indication of the missing permission — it simply returns an empty dataset. If you see 0 rows
> in Phase 4, this is the first thing to check.
>
> Note: a Viewer site role user can query successfully if API Access is granted. Site role alone
> does not block VizQL Data Service access.

---

## Phase 2 — Configure Secrets *(~10 min)*

All terminal commands in Phase 2 are run from the `tab-mcp` directory.

### Step 2.1 — Generate RSA Key Pairs

```bash
npx tsx uat/scripts/generateKeys.ts
```

> **What this does:** Creates three cryptographic key files in `uat/keys/`. You don't need to
> understand them. The server uses them to sign tokens and decrypt responses.

The script prints the **absolute file paths** of all three keys. **Copy this output** — you
will paste the paths into the configuration file in Step 2.3.

| File created | Purpose |
|-------------|---------|
| `uat/keys/uat_private_key.pem` | Signs authentication tokens sent to Tableau Cloud |
| `uat/keys/uat_public_key.pem` | Registered with Tableau Cloud Manager (used automatically) |
| `uat/keys/oauth_jwe_private_key.pem` | Decrypts access tokens returned by the OAuth server |

---

### Step 2.2 — Register with Tableau Cloud Manager

This step registers your local MCP server as a trusted application in Tableau Cloud Manager.

#### First: Get a TCM Personal Access Token

1. Sign in to `https://cloudmanager.tableau.com`
2. Click your profile icon → **My Account Settings**
3. Under **Personal Access Tokens**, click **Create Token**
4. Give it any name (e.g. `mcp-uat-demo`)
5. Copy the token **secret** immediately — it is shown only once

> The token secret is your `TCM_PAT_SECRET`. The token name is not used by the registration
> script — only the secret is sent.

#### Then: Run the Registration Script

```bash
SITE_NAME=[YOUR_SITE_CONTENT_URL] TCM_PAT_SECRET=[YOUR_TCM_SECRET] npx tsx uat/scripts/registerUat.ts
```

Replace both values:
- `[YOUR_SITE_CONTENT_URL]` — the short slug from your Tableau Cloud URL (see note below)
- `[YOUR_TCM_SECRET]` — the PAT secret you just copied

> **What is `SITE_NAME`?**
> It is the `contentUrl` slug — the short identifier in your Tableau Cloud URL, not the display
> name shown in the site selector dropdown.
>
> Examples:
> - URL: `https://10ax.online.tableau.com/#/site/mycompanydemo/home` → `SITE_NAME=mycompanydemo`
> - URL: `https://prod-useast-a.online.tableau.com/#/site/field-demo/home` → `SITE_NAME=field-demo`
> - Default site (no slug in URL): `SITE_NAME=` (leave blank — but the variable must be set)

**The script prints two values.** Copy them for the next step:

```
UAT_TENANT_ID=<printed by script>
UAT_ISSUER=<printed by script>
```

---

### Step 2.3 — Create the `tests/.env` File

> **What is a `.env` file?**
> It is a plain text configuration file that stores settings and secrets for the server.
> Create it with any text editor — TextEdit on Mac (use Format → Make Plain Text first),
> Notepad on Windows, or VS Code. Save it as `tests/.env` inside the `tableau-mcp-external` folder.
> There is no `.txt` extension — the filename is literally `.env`.

Start from `tests/.env.example`, copy it to `tests/.env`, then replace every `[PLACEHOLDER]`
or `<placeholder>` with your actual values using the collected information from earlier steps.

```bash
TRANSPORT=http
AUTH=uat
SERVER=https://[YOUR_POD].online.tableau.com/
SITE_NAME=[YOUR_SITE_CONTENT_URL]

UAT_TENANT_ID=[FROM_STEP_2.2_OUTPUT]
UAT_ISSUER=[FROM_STEP_2.2_OUTPUT]
UAT_USERNAME_CLAIM_NAME=email
UAT_USERNAME_CLAIM={OAUTH_USERNAME}
UAT_PRIVATE_KEY_PATH=[ABSOLUTE_PATH_TO_uat/keys/uat_private_key.pem]

OAUTH_ISSUER=http://127.0.0.1:3927
OAUTH_JWE_PRIVATE_KEY_PATH=[ABSOLUTE_PATH_TO_uat/keys/oauth_jwe_private_key.pem]

CREATOR_EMAIL=[YOUR_CREATOR_USER_EMAIL]
VIEWER_EMAIL=[YOUR_VIEWER_USER_EMAIL]
DATASOURCE_LUID=[FROM_STEP_1.4]

DEFAULT_LOG_LEVEL=debug
```

**Where each value comes from:**

| Variable | Where to get it |
|----------|----------------|
| `SERVER` | Your Tableau Cloud URL (up to and including `.com/`) |
| `SITE_NAME` | The `contentUrl` slug — same value used in Step 2.2 |
| `UAT_TENANT_ID` | Printed by `registerUat.ts` in Step 2.2 |
| `UAT_ISSUER` | Printed by `registerUat.ts` in Step 2.2 |
| `UAT_PRIVATE_KEY_PATH` | Absolute path printed by `generateKeys.ts` in Step 2.1 |
| `OAUTH_JWE_PRIVATE_KEY_PATH` | Absolute path printed by `generateKeys.ts` in Step 2.1 |
| `CREATOR_EMAIL` | Email address of the Creator demo user from Step 1.1 |
| `VIEWER_EMAIL` | Email address of the Viewer demo user from Step 1.1 |
| `DATASOURCE_LUID` | LUID copied from Tableau Cloud URL in Step 1.4 |

> **Critical: no inline comments.**
> Do not add `# comments` after values on the same line, e.g. `SERVER=https://... # my site`.
> The configuration reader treats everything after the `=` as the value — including the comment.
> This will silently break key validation at startup. Comments on their own line are fine.

---

## Phase 3 — Start the Demo *(~5 min)*

You need **three separate terminal windows** for Phase 3. Open them now.

### Step 3.1 — Run Preflight Check (Terminal 1)

```bash
npm run uat:check
```

This validates 7 conditions: env file exists, auth mode is set, all required variables are
present, key files are readable, and port 3927 is free.

**7 green `✓` lines = proceed.** If you see any red `✗`, the output tells you exactly which
variable or file is missing. Fix it in `tests/.env` and re-run.

---

### Step 3.2 — Start the MCP Server (Terminal 1, keep open)

```bash
npm run uat:up
```

This runs preflight, builds the server, and starts it. It takes about 30 seconds.

**Success:** The last line reads:
```
Listening on http://127.0.0.1:3927
```

The process stays running — no prompt returns. **Keep this terminal open** for the duration
of the demo. The server stops if you close it.

---

### Step 3.3 — Start the Inspector (Terminal 2)

```bash
nohup npx @modelcontextprotocol/inspector --config config.http.json --server tableau > /tmp/inspect.log 2>&1 &
sleep 3 && cat /tmp/inspect.log
```

> **What this does:** Starts the MCP Inspector UI as a background process and prints its URL.
> The Inspector is the browser-based tool you will use to run queries in Phase 4.

The output will contain a URL:
```
http://localhost:6274/?MCP_PROXY_AUTH_TOKEN=<token>
```

**Open this URL in your browser.**

> Do not use `npm run uat:inspect` here — that command starts its own server on port 3927,
> which conflicts with the server already running from Step 3.2.

---

### Step 3.4 — Generate Authentication Tokens (Terminal 3)

```bash
npx tsx --env-file=tests/.env uat/scripts/generateTestTokens.ts
```

Output:
```json
{
  "creator": "eyJhbGci...",
  "viewer":  "eyJhbGci..."
}
```

**Copy both tokens.** You will paste them into the Inspector in Phase 4.

> Tokens expire after 1 hour. If you see `401 Unauthorized` during the demo, regenerate tokens
> by re-running this command and re-authenticating in the Inspector.

---

## Phase 4 — Run the Demo *(~5 min)*

### Step 4.1 — Authenticate as the Creator User

In the MCP Inspector browser tab:

1. Click **Authentication**
2. Under **Custom Headers**, fill in:
   - **Header Name**: `Authorization`
   - **Header Value**: `Bearer ` followed by the **creator** token from Step 3.4
3. Click **Connect**

The History panel should show `initialize`, `logging/setLevel`, and `tools/list` — confirming
a live, authenticated connection.

---

### Step 4.2 — Query as Creator

1. Click **Tools** → select **`query-datasource`**
2. Fill in the **`datasourceLuid`** field with your LUID from Step 1.4
3. Switch the **`query`** field to JSON mode, then paste:

```json
{
  "fields": [
    { "fieldCaption": "Region", "sortDirection": "ASC", "sortPriority": 1 },
    { "fieldCaption": "Sales", "function": "SUM" },
    { "fieldCaption": "Profit", "function": "SUM" }
  ]
}
```

4. Click **Run Tool**

> **Important:** Fill `datasourceLuid` and `query` in their **separate fields**. Do not paste
> a combined JSON object into the query field — the Inspector will corrupt it silently.

**Expected result for Creator — West and South only:**

```json
{
  "data": [
    { "Region": "South", "SUM(Sales)": 391722, "SUM(Profit)": 46749 },
    { "Region": "West",  "SUM(Sales)": 739814, "SUM(Profit)": 110799 }
  ]
}
```

---

### Step 4.3 — Authenticate and Query as Viewer

Open a **new incognito/private browser window** and navigate to the same Inspector URL from
Step 3.3.

> **Use incognito, not just a new tab.** Browser tabs in the same window share session state.
> An incognito window gives the Viewer a completely isolated session.

Repeat Steps 4.1 and 4.2, this time using the **viewer** token and the same LUID and query.

**Expected result for Viewer — East and Central only:**

```json
{
  "data": [
    { "Region": "Central", "SUM(Sales)": 503171, "SUM(Profit)": 39865 },
    { "Region": "East",    "SUM(Sales)": 691828, "SUM(Profit)": 94883 }
  ]
}
```

---

### The Proof

| User | Regions returned | Rows |
|------|-----------------|------|
| Creator | West, South | 2 |
| Viewer | East, Central | 2 |

The MCP server sent **identical queries**. Tableau Cloud returned different data based solely
on who was authenticated. The filtering happened inside the Virtual Connection engine — not in
the MCP server, not in the application, not in the AI layer.

This answers the question every security-conscious customer asks: *"Does connecting an AI
assistant to Tableau mean it can see everything?"*

The answer is no. The same governance that protects your dashboards protects your AI agent
queries. The security lives in the data layer. It travels with every query, automatically.

---

## Phase 5 — Automated Validation *(30 seconds)*

For a one-command, no-browser proof:

```bash
npx tsx --env-file=tests/.env uat/scripts/rlsValidate.ts
```

This script generates tokens for both users, runs identical queries programmatically, and
prints a comparison with a pass/fail verdict. All configuration is read from `tests/.env` —
no manual edits needed.

**Expected output when correctly configured:**

```
RLS Validation — <timestamp>
Datasource: <your-datasource-luid>
Query: Region + SUM(Sales) + SUM(Profit)

── Creator (<creator-email>) ──
Rows returned: 2
[ { "Region": "South", ... }, { "Region": "West", ... } ]

── Viewer (<viewer-email>) ──
Rows returned: 2
[ { "Region": "Central", ... }, { "Region": "East", ... } ]

════ VERDICT ════
✓  Data differs: Creator=2 row(s) vs Viewer=2 row(s)
✓  Tableau Cloud enforced RLS at the data layer.
✓  The MCP server sent identical queries — filtering happened in Tableau.
```

---

## Troubleshooting Quick Reference

### Either user returns 0 rows

Work through in order — one of these four causes accounts for almost all cases:

1. **Missing API Access permission** — the most common cause. Open Tableau Cloud → datasource →
   Actions → Permissions. Confirm both users have **View + Connect + API Access** all granted.
   View and Connect alone are not sufficient. Without API Access, queries return 0 rows with no
   error message.

2. **Wrong datasource** — confirm you are querying the datasource published through the Virtual
   Connection (Step 1.4), not the raw Superstore datasource. The LUID must match the VC-backed
   datasource.

3. **Data Policy condition mismatch** — open the Virtual Connection → Data Policies →
   `rls_entitlement`. Confirm both email addresses in the `LOWER(USERNAME())` conditions match
   exactly what is in `tests/.env` (`CREATOR_EMAIL` and `VIEWER_EMAIL`).

4. **Token issued for wrong email** — re-run `generateTestTokens.ts` and confirm the printed
   emails match your Tableau Cloud users.

---

### Both users see the same data

You are sharing browser session state. Use a genuine **incognito/private window** for the
Viewer session — not just a new tab in the same browser profile.

---

### Server fails to start: `SERVER is not set`

You ran `node build/index.js` without the env file. Use `npm run uat:up` instead, or:

```bash
node --env-file=tests/.env build/index.js
```

---

### `registerUat.ts` fails with 401

Your `TCM_PAT_SECRET` is either wrong or it is a Tableau Cloud site PAT instead of a TCM PAT.
Create the PAT at `https://cloudmanager.tableau.com` — not inside your Tableau Cloud site.

---

### Port 3927 already in use

```bash
kill $(lsof -ti:3927) 2>/dev/null
```

Re-run `npm run uat:up`.

---

### Token expired mid-demo: `401 Unauthorized`

```bash
npx tsx --env-file=tests/.env uat/scripts/generateTestTokens.ts
```

Re-authenticate in the Inspector (Step 4.1) with the new tokens. Tokens are valid for 1 hour.

---

## Reference

| Document | Contents |
|----------|---------|
| [`RUNBOOK-rls-customer-repro.md`](RUNBOOK-rls-customer-repro.md) | Full technical reference: architecture, all troubleshooting scenarios, adapting to your own data |
| [`RUNBOOK-tableau-mcp-uat.md`](RUNBOOK-tableau-mcp-uat.md) | UAT authentication deep-dive: token flow, key rotation, TCM API reference |

| Script | What it does |
|--------|-------------|
| `uat/scripts/generateKeys.ts` | Creates RSA key pairs (Step 2.1) |
| `uat/scripts/registerUat.ts` | Registers UAT config in Tableau Cloud Manager (Step 2.2) |
| `uat/scripts/preflight.ts` | Validates `tests/.env` before server startup (Step 3.1) |
| `uat/scripts/generateTestTokens.ts` | Generates JWE tokens for both demo users (Step 3.4) |
| `uat/scripts/rlsValidate.ts` | Automated end-to-end RLS validation (Phase 5) |
