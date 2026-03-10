> ⚠ **ARCHIVED — This workflow is confirmed non-functional for VizQL Data Service / MCP queries.**
> User Filter Sets on regular published datasources return 0 rows through the API regardless of
> Desktop configuration. The working RLS mechanism is a Virtual Connection Data Policy.
> See `RUNBOOK-rls-demo.md` § Prerequisite and LRN-20260301-035/036 in `.learnings/LEARNINGS.md`.

## What Works Instead: Virtual Connection Data Policy

RLS enforcement for VizQL Data Service and MCP queries requires a **Data Policy** configured inside
a Tableau Virtual Connection — not a filter on a regular published datasource.

| Mechanism | Result via VizQL Data Service |
|-----------|-------------------------------|
| `USERNAME()` in regular calculated field filter | 0 rows — `USERNAME()` returns null |
| `USERATTRIBUTEINCLUDES` datasource filter | 0 rows — JWT claims not surfaced |
| User Filter Set on regular datasource | 0 rows — not enforced via API |
| `USERNAME()` in VC Data Policy | ✓ Correct rows per user |

`USERNAME()` is evaluated server-side within the Virtual Connection engine, which maintains user
context through VizQL Data Service queries. Regular datasource filters run in a different execution
path and do not receive the authenticated user identity from the API layer.

### How to configure a Virtual Connection Data Policy

1. Go to **Tableau Cloud → Explore → Virtual Connections**
2. Open (or create) the Virtual Connection that backs your datasource
3. Select the **Data Policies** tab
4. Click **New Policy** — choose the table and the column to filter on (e.g. `Orders → Region`)
5. Write the policy condition using `LOWER(USERNAME())`:

```sql
(
  LOWER(USERNAME()) = 'user-a@example.com'
  AND ([Region] = 'West' OR [Region] = 'South')
)
OR
(
  LOWER(USERNAME()) = 'user-b@example.com'
  AND ([Region] = 'East' OR [Region] = 'Central')
)
```

6. Save and publish the Virtual Connection
7. Publish a datasource that connects through this Virtual Connection (not a direct datasource)

Verify in the editor that **Orders -> Region** is mapped as the policy column and that Tableau
shows **Calculation is valid** before you save.

> The demo datasource **Sample - Superstore with VC policies** already has a policy named
> `rls_entitlement` configured with the Region mapping above. See `RUNBOOK-rls-demo.md` for
> the full validation walkthrough.

---

# Setting Up Tableau User Filters for Row-Level Security

> **What this guide does:** Walks you through creating a simple User Filter in Tableau Desktop
> that restricts which rows of data each person can see — without any complex formulas or
> database joins. You map each user to the values they're allowed to see. Tableau enforces it
> automatically, everywhere that data is used.

---

## How It Works

Tableau's **User Filter** is the simplest way to implement Row-Level Security. When a user opens
a dashboard or runs a query, Tableau checks who is signed in, looks up their mapping in the
filter, and returns only the rows they are allowed to see.

For this demo, the filter is applied to the `Region` field:

| User (email = Tableau username) | Allowed Regions |
|---------------------------------|-----------------|
| `creator-user@example.com` | West, South |
| `viewer-user@example.com` | East, Central |

> **On Tableau Cloud, a user's username is their email address.** The built-in `USERNAME()`
> function returns the full email (e.g. `creator-user@example.com`). The User Filter
> uses this value as the lookup key — so you map email addresses to data values.

---

## What You Need Before You Start

- **Tableau Desktop** installed (any current version)
- **A Tableau Cloud site admin or Creator role** — enough permission to edit and republish
  the datasource
- Both demo users already exist on the Tableau Cloud site:
  - `creator-user@example.com`
  - `viewer-user@example.com`
- The datasource **Sample - Superstore with VC policies** already published to project
  **Data Sources**

> **If the users don't yet exist on the site**, add them first via
> **Tableau Cloud → Users → Add Users** before proceeding. The User Filter dialog only shows
> users who are already members of the site.

---

## Step 1 — Connect to the Published Datasource

1. Open **Tableau Desktop**
2. Sign in to your Tableau Cloud site when prompted
   (`https://<your-tableau-cloud-pod>.online.tableau.com/` — use your admin credentials)
3. From the **Start page**, click **Connect → Tableau Server**
4. Navigate to the site, find project **Data Sources (LD)**, and open
   **Sample - Superstore with VC policies**
5. Once the datasource loads, open or create a worksheet — you need to be on a
   **worksheet tab** for the menu option to appear

---

## Step 2 — Open the User Filter Dialog

1. With a worksheet active, go to the menu bar: **Server → Create User Filter**
2. A sub-menu appears listing all fields in the datasource — select **Region**
3. The **User Filter dialog** opens:
   - **Left panel**: lists every user and group on your Tableau Cloud site
   - **Right panel**: lists every distinct value in the Region field
     (Central, East, South, West)

   The mapping works like a permission table: select a user on the left, tick the
   region values they can see on the right.

---

## Step 3 — Map Creator to West and South

1. In the **left panel**, click **`creator-user@example.com`**
2. In the **right panel**, tick **West** and **South**
3. The other two values (Central, East) should be **unticked** for this user

---

## Step 4 — Map Viewer to East and Central

1. Still in the same dialog, click **`viewer-user@example.com`** in the left panel
2. In the **right panel**, tick **East** and **Central**
3. West and South should be **unticked** for this user

> **Tip:** To double-check your mappings before saving, click each user name in turn and
> confirm the ticked values on the right match the table above.

4. Give the filter a name at the top of the dialog — e.g. `RLS - Region by User`
5. Click **OK**

---

## Step 5 — Apply the Filter at the Data Source Level (Not the Worksheet)

> **Critical:** Add the filter in the **Data Source tab**, not the worksheet Filters shelf.
> A filter on the worksheet shelf only applies to that worksheet. A filter added in the
> Data Source tab is embedded in the published datasource and applies to **every tool that
> queries it** — dashboards, the MCP server, direct API calls.

The filter you just created appears in the **Sets** section of the Data pane.

1. Click the **Data Source** tab (bottom-left of Tableau Desktop) to return to the datasource view
2. In the top-right corner, click **Add** next to **Filters** (currently showing `Filters 0 | Add`)
3. In the filter dialog, find and select **Sets** → choose **`RLS - Region by User`**
4. Click **OK** — the counter updates to `Filters 1`

> **Test it now:** Go to a worksheet tab, then in the bottom-right corner click **Filter as User**
> and select `creator-user@example.com`. The data should show only West and South.
> Switch to the Viewer user — you should see only East and Central.

> **If the datasource shows as Read-Only:** You are connected directly to the published version
> on Tableau Cloud, which cannot be edited in place. Instead, create a new Tableau workbook,
> connect to the same datasource, make your changes there, and republish (overwriting the
> existing datasource). You will need Creator permissions on the site.

---

## Step 6 — Publish the Datasource with the Filter

You need to publish the datasource (not just the workbook) so the filter applies to every
tool that connects to it — including the MCP server and any dashboards.

1. Go to **Server → Publish Data Source → Sample - Superstore with VC policies**
2. In the Publish dialog:
   - **Project**: Data Sources (LD)
   - **Name**: Sample - Superstore with VC policies *(keep the existing name to overwrite)*
3. Before clicking Publish, click **Permissions** in the dialog

### Lock Down Permissions (Critical)

Without this step, a sufficiently technical user could download the datasource and remove
the filter. Set the following for **all users / the site default role**:

| Permission | Setting |
|------------|---------|
| Save | **Deny** |
| Download / Save a Copy | **Deny** |
| Set Permissions | **Deny** |

4. Click **Publish**
5. Tableau will warn you that a datasource with this name already exists — confirm
   **Overwrite**

---

## Step 7 — Verify with the Validation Script

With the MCP server running, confirm the filter is working correctly:

```sh
npx tsx --env-file=tests/.env uat/scripts/rlsValidate.ts
```

**Expected output:**

```
── Creator (creator-user@example.com) ──
Rows returned: 2
[ { "Region": "West", ... }, { "Region": "South", ... } ]

── Viewer (viewer-user@example.com) ──
Rows returned: 2
[ { "Region": "Central", ... }, { "Region": "East", ... } ]

════ VERDICT ════
✓  Row counts differ: Creator=2 vs Viewer=2
✓  Tableau Cloud enforced RLS at the data layer.
```

---

## Troubleshooting

### The User Filter dialog is greyed out or Server menu is missing

You must be on an active worksheet tab with a live connection to the datasource. Check that
you are signed in to Tableau Cloud (Server → Sign In) and have a worksheet open.

### A user's email does not appear in the left panel

The user does not yet exist on the Tableau Cloud site. Add them via the site admin panel
(**Users → Add Users**), then re-open the User Filter dialog.

### A user sees 0 rows after publishing

Their email has no mapping in the User Filter, or the filter was saved without ticking any
values for them. Re-open the dialog (Server → Create User Filter → Region), select their
email on the left, tick the correct regions, and republish the datasource.

### Both users see the same data (or all data)

The filter was created but not dragged to the Filters shelf, or it was placed on the Filters
shelf in the workbook but the **datasource** was not republished with the filter embedded.
Repeat Steps 5 and 6.

### The validation script shows 0 rows but "Filter as User" in Desktop shows rows

The Desktop preview uses your local workbook filter. The published datasource may be an older
version without the filter. Republish the datasource (Step 6) and retest.

---

## Key Things to Know

### Why `USERNAME()` — not an email-specific function

Tableau's `USERNAME()` function returns the authenticated user's username. On Tableau Cloud,
usernames are email addresses — so `USERNAME()` naturally returns the full email
(e.g. `creator-user@example.com`). The User Filter uses this same value internally.
There is no separate `USEREMAIL()` function.

### This filter applies to everything, not just dashboards

Once published at the datasource level, the User Filter applies to:
- Tableau dashboards and workbooks that connect to this datasource
- Direct API queries via the VizQL Data Service
- MCP tool calls (e.g. `query-datasource` from the AI assistant)
- Tableau Pulse metrics built on this datasource

> ⚠ **Correction (2026-03-01):** The bullets above are **not accurate for API paths**.
> Direct VizQL Data Service queries and MCP `query-datasource` calls return 0 rows with
> User Filter Sets — confirmed non-functional. Only VC Data Policies work via the API.
> See the archive notice at the top of this document.

The user's identity is always verified at sign-in. There is no way to bypass the filter
from a connected tool.

### The filter mapping lives in the published datasource

The user-to-value mapping you created is stored inside the published datasource on Tableau
Cloud. If you need to add, remove, or change a user's access, repeat this process and
republish. You do not need to update every workbook that uses the datasource — the change
applies automatically everywhere.

### Users must exist on the site

The User Filter only works for users who have a Tableau Cloud account on the site. If a user
authenticates via UAT or Connected Apps but has never been added as a site member, Tableau
will not find a match in the filter and will return 0 rows.
