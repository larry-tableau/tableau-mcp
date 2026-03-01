# Row-Level Security Demo: Same Question, Different Answer

> **What this proves:** Two people ask Tableau the exact same question. They get different data back.
> Not because the app filtered it. Not because we hid a column. Because Tableau Cloud enforced
> your security rules at the data layer — before the answer ever left the server.
>
> This is Row-Level Security (RLS) in action. And it works through an AI assistant just as
> reliably as it does through a dashboard.

---

## Why This Matters

When you connect an AI assistant or MCP-enabled tool to Tableau, a natural question arises:
*"Does the AI bypass our data governance?"*

The answer is no — and this demo proves it.

The MCP server sends **identical queries** for both users. Tableau Cloud returns different results
based on who is asking. The filtering happens at the source, not in the application. This means:

- A regional sales manager sees only their territory's numbers
- A finance analyst sees only their division's costs
- An executive sees the full picture

Same tool. Same question. Governed data. Every time.

---

## What You Will See

When this demo is running correctly, here is the expected outcome:

| User | Role | Regions returned | Why |
|------|------|-----------------|-----|
| `creator-user@example.com` | Creator Demo | **West, South** (2 rows) | VC Data Policy `rls_entitlement` maps this user → West, South |
| `viewer-user@example.com` | Viewer Demo | **East, Central** (2 rows) | VC Data Policy `rls_entitlement` maps this user → East, Central |

Both users call the same `query-datasource` tool with identical inputs. The data returned is
different because Tableau Cloud evaluates the `rls_entitlement` VC Data Policy against the
authenticated user identity — not the MCP server.

> **If either user returns 0 rows**, check the `rls_entitlement` VC Data Policy condition in the Virtual Connection.
> See [Prerequisite: Virtual Connection Data Policy](#2-prerequisite-virtual-connection-data-policy) below.

---

## Prerequisites

### 1. Complete Initial Setup

Complete `RUNBOOK-tableau-mcp-uat.md` (Steps 1–4) before running this demo:
- `tests/.env` must exist and be populated
- `npm run build` must have been run at least once

### 2. Prerequisite: Virtual Connection Data Policy

RLS is enforced via a **Data Policy** inside the Tableau Virtual Connection, not via a datasource
filter in Tableau Desktop. The policy is already configured on
**Sample - Superstore with VC policies** (LUID: `<datasource-luid>`).

**Policy name:** `rls_entitlement`
**Table:** Orders → Region column
**Policy condition:**

```
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

To modify or verify: **Tableau Cloud → Virtual Connections → Sample - Superstore with VC policies
→ Data Policies tab → rls_entitlement**.

> **Why Virtual Connection Data Policy — not a regular datasource filter?**
>
> | Mechanism | Result via VizQL Data Service |
> |-----------|-------------------------------|
> | `USERNAME()` in regular calculated field filter | 0 rows — `USERNAME()` returns null |
> | `USERATTRIBUTEINCLUDES` datasource filter | 0 rows — JWT claims not surfaced |
> | User Filter Set on regular datasource | 0 rows — not enforced via API |
> | `USERNAME()` in VC Data Policy | ✓ Correct rows per user |
>
> `USERNAME()` is evaluated server-side within the Virtual Connection engine, which maintains
> user context through VizQL Data Service queries. See LRN-20260301-035, LRN-20260301-036.

---

## Step 1 — Start the MCP Server

Open a **Terminal window** and run:

```sh
npm run uat:up
```

You should see:

```
Listening on http://127.0.0.1:3927
```

**Leave this terminal open.** The server must stay running for the entire demo.

To stop the server: press `Ctrl+C` in this terminal.

> `uat:up` runs environment preflight checks then builds and starts the server. Direct command:
> `node --env-file=tests/.env build/index.js` — plain `node build/index.js` fails (`SERVER is not set`).

---

## Step 2 — Open the MCP Inspector

Open a **second Terminal window** and run:

```sh
npm run uat:inspect
```

Your browser opens automatically at `http://localhost:6274`.

> **You will see `401 Unauthorized` errors in the terminal. This is completely normal.**
> The Inspector is detecting that sign-in is required and starting the OAuth handshake. You can
> ignore the terminal entirely — everything you need is in the browser.

To stop the Inspector: press `Ctrl+C` in this terminal.

---

## Step 3 — Sign in as User 1 (Creator)

In the browser:

1. Click **Connect**
2. A Tableau Cloud sign-in page opens — sign in as the **Creator** user:
   - Email: `creator-user@example.com`
   - Password: `<user-password>`
3. After sign-in, the Inspector redirects back and shows **Connected**

If the Inspector doesn't show a Connect button, refresh the page.

---

## Step 4 — Open a Second Session as User 2 (Viewer)

Open an **incognito / private browser window** (or a separate browser profile).

Navigate to the same Inspector URL shown in the terminal — it will look like:
`http://localhost:6274/?MCP_PROXY_AUTH_TOKEN=...`

Repeat Step 3 in this second window, signing in as the **Viewer** user:
- Email: `viewer-user@example.com`
- Password: `<user-password>`

> A private window is essential. It keeps the two sessions separate so each user has their own
> OAuth token and Tableau identity.

---

## Step 5 — Run the Same Query in Both Windows

In **each** Inspector window, call `query-datasource` with identical inputs:

### Field 1 — `datasourceLuid`

```
<datasource-luid>
```

### Field 2 — `query` (switch this field to **JSON mode** first)

```json
{
  "fields": [
    { "fieldCaption": "Region", "sortDirection": "ASC", "sortPriority": 1 },
    { "fieldCaption": "Sales", "function": "SUM" },
    { "fieldCaption": "Profit", "function": "SUM" }
  ]
}
```

> **Common mistake:** The Inspector has two separate input fields — `datasourceLuid` and `query`.
> Paste the LUID into the first field. Switch the `query` field to JSON mode, then paste only the
> object starting with `"fields"`. Do not paste the full combined JSON into either field.

Click **Run Tool** in both windows.

---

## Step 6 — Compare the Results

The moment of proof: two identical queries, two different results.

**Creator sees West and South only:**

| Region | Sales | Profit |
|--------|-------|--------|
| South | ~$391,722 | ~$46,749 |
| West | ~$739,814 | ~$110,799 |

**Viewer sees East and Central only** (once the VC Data Policy is active):

| Region | Sales | Profit |
|--------|-------|--------|
| Central | … | … |
| East | … | … |

**This is the proof point:** The MCP server sent the same query for both users. Tableau Cloud
returned different data based on the authenticated identity of each user. No application-level
filtering. No hidden columns. The security lives in the data layer — and AI-powered tools
respect it automatically.

---

## Troubleshooting

### Either user returns 0 rows

Work through this checklist in order:

1. **VC Data Policy condition** — Tableau Cloud → Virtual Connections →
   Sample - Superstore with VC policies → Data Policies → rls_entitlement.
   Confirm the `LOWER(USERNAME())` condition includes the user's email.
2. **Datasource permissions** — both demo users need View + Connect on the
   published datasource in Tableau Cloud.
3. **Server is using the VC datasource LUID** — confirm
   DATASOURCE_LUID = <datasource-luid> in rlsValidate.ts.

### "401 Unauthorized" in the terminal

This is expected behaviour. The MCP Inspector probes the server, detects that authentication is
required, and automatically kicks off the OAuth sign-in flow. Ignore the terminal and use the
browser.

### Inspector shows a blank page or no Connect button

Refresh the browser. If the Inspector URL has a token parameter, make sure the full URL including
the token is in your address bar.

### Both users return the same data

Both sessions may be sharing the same browser cookies. Use a genuine incognito/private window for
User 2, not just a new tab.

---

## Automated Validation (No Browser Required)

For a quick, repeatable test without the Inspector UI, run the validation script directly:

```sh
npx tsx --env-file=tests/.env uat/scripts/rlsValidate.ts
```

This script creates authenticated sessions for both users programmatically, calls
`query-datasource` identically for each, and prints a side-by-side comparison.

**Expected output when both users are correctly configured:**

```
── Creator (creator-user@example.com) ──
Rows returned: 2
[ { "Region": "West", ... }, { "Region": "South", ... } ]

── Viewer (viewer-user@example.com) ──
Rows returned: 2
[ { "Region": "Central", ... }, { "Region": "East", ... } ]

════ VERDICT ════
✓  Data differs: Creator=2 row(s) vs Viewer=2 row(s)
✓  Tableau Cloud enforced RLS at the data layer.
✓  The MCP server sent identical queries — filtering happened in Tableau.
```

> If the Viewer returns 0 rows, the script will print an actionable message explaining the cause
> and the exact fix needed in Tableau Desktop.

---

## How It Works (For the Curious)

When a user authenticates through the MCP server, their identity is embedded in a **User Attribute
Token (UAT)** — a signed JWT sent to Tableau Cloud. Tableau authenticates the user and evaluates
the **Virtual Connection Data Policy** (`rls_entitlement`), which uses `LOWER(USERNAME())` to
match the authenticated email against the allowed region list.

The MCP server sends identical queries for every user. Tableau does all the filtering — inside
the Virtual Connection engine, before any data is returned.

- No security logic in the AI tool or MCP integration
- Region access is defined once in the VC Data Policy and enforced at every query
- Changing a user's access means editing the policy condition in the Virtual Connection

**The security model is: define it once in the Virtual Connection, enforced everywhere, via authenticated user identity.**
