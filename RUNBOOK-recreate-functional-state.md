# Tableau MCP — Definitive Rebuild Runbook

> **Status:** Canonical runbook. Use this document as the single source of truth to recreate this repository from a fresh checkout to a verified functional state for the Tableau MCP row-level security showcase.
>
> **Audience:** AI agents first, human operators second.
>
> **Outcome:** A local Tableau MCP server running on `http://127.0.0.1:3927`, backed by Tableau Cloud, proving that two users can run the same query and receive different results because Tableau enforces row-level security at the data layer.

---

## Goal

Use a fresh checkout of this repository to recreate the exact functional state needed to prove:

1. Two Tableau Cloud users exist and are mapped to different row-level entitlements.
2. The MCP server is configured with **UAT + OAuth** and can operate with per-user identity.
3. An identical `query-datasource` call returns **different rows** for the two users.
4. The filtering happens in **Tableau Cloud Virtual Connection Data Policy**, not in the MCP client or application layer.

If you complete this runbook successfully, you will have recreated the showcased state.

---

## Completion Contract

Do not declare success until **all** of the following are true:

- `npm run uat:check` passes.
- The server starts and listens on `http://127.0.0.1:3927`.
- `npx tsx --env-file=tests/.env uat/scripts/rlsValidate.ts` shows differentiated result sets for the two users.
- The result difference is attributable to Tableau Cloud RLS, not to different queries.
- Optional: MCP Inspector can reproduce the same proof manually in two isolated browser sessions.

---

## Repo Truths You Must Not Infer Incorrectly

These are non-obvious facts already established by the repo and its supporting artefacts:

- `SITE_NAME` is the Tableau site **`contentUrl` slug**, not the display name.
- **Virtual Connection Data Policy** is the only supported RLS mechanism for this MCP/VizQL showcase.
- Regular published datasource filters, `USERATTRIBUTEINCLUDES`, and User Filter Sets are **not** the working mechanism for this proof.
- `tests/.env.example` is the authoritative environment template for this workflow.
- `uat/.env.example` exists as a supporting artefact only and must not be treated as the primary template.
- UAT registration is done through the **Tableau Cloud Manager REST API**, not through the Tableau Cloud site admin UI.
- Both users need **API Access** on the published datasource. View and Connect alone are insufficient.
- A Viewer user can still return rows successfully if API Access is granted.
- Do **not** use `npm run uat:inspect` if the server is already running separately. That command starts another server and can conflict on port `3927`.
- For a deterministic rebuild from a clean checkout, use `npm ci`, not `npm install`.

---

## Prerequisites

Do not proceed until every prerequisite below is satisfied.

### Local machine prerequisites

- Node.js `22.7.5` or newer
- npm available
- Git available
- A browser available for Tableau Cloud and optional MCP Inspector use

### Tableau access prerequisites

- Tableau Cloud site **Creator** or **Administrator** access
- Tableau Cloud Manager (**TCM**) **cloud administrator** access to `https://cloudmanager.tableau.com`
- Permission to create:
  - two Tableau Cloud demo users
  - one Virtual Connection
  - one Data Policy
  - one published datasource
  - datasource permissions with API Access

### Required runtime inputs

You must have these values available during execution:

- Tableau Cloud server URL: `https://<your-tableau-cloud-pod>.online.tableau.com/`
- Tableau site `contentUrl` slug
- Two Tableau Cloud user emails:
  - `creator-user@example.com`
  - `viewer-user@example.com`
- TCM PAT secret

### Failure signal

If you do not have TCM cloud admin access, stop. This workflow cannot reach a complete functional state without UAT registration.

---

## Step 1 — Fresh Checkout And Dependency Install

Run from a clean shell:

```bash
git clone https://github.com/larry-tableau/tableau-mcp.git
cd tableau-mcp
npm ci
```

### Expected success signal

- `npm ci` exits with code `0`
- `node_modules/` is populated

### Failure signals

- Missing Node.js or wrong version
- npm install failure

### Next action if failure occurs

- Check `node --version`
- Upgrade Node to `>=22.7.5`
- Re-run `npm ci`

### Do not proceed until

`npm ci` completes successfully.

---

## Step 2 — Create The Tableau Cloud Demo State

All actions in Step 2 happen in Tableau Cloud UI.

### Step 2.1 — Create Two Demo Users

Create or identify two users:

| Role | Suggested email | Site role |
|------|-----------------|-----------|
| Creator demo user | `creator-user@example.com` | Creator |
| Viewer demo user | `viewer-user@example.com` | Viewer |

### Expected success signal

Both users exist on the target Tableau Cloud site.

### Failure signal

One or both users do not appear in Tableau Cloud user management.

### Next action if failure occurs

Create the missing users before continuing.

### Do not proceed until

Both user emails are confirmed and recorded.

---

### Step 2.2 — Create A Virtual Connection

In Tableau Cloud:

1. Go to **Explore → New → Virtual Connection**
2. Connect to **Tableau Samples → Superstore** if available, or another datasource with an `Orders` table and `Region` field
3. Add the `Orders` table
4. Publish the Virtual Connection with a clear name such as `Superstore with RLS Policies`

### Expected success signal

The Virtual Connection exists and is accessible in Tableau Cloud.

### Failure signal

You cannot create or publish the Virtual Connection.

### Next action if failure occurs

Check site role and project permissions. Stop if you cannot create the Virtual Connection.

### Do not proceed until

The Virtual Connection is published successfully.

---

### Step 2.3 — Add The Data Policy

Inside the Virtual Connection:

1. Open **Data Policies**
2. Create a policy named `rls_entitlement`
3. Map `Orders → Region`
4. Use this policy condition, replacing the email addresses with your actual user emails:

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

5. Confirm Tableau shows **Calculation is valid**
6. Save and publish the Virtual Connection

### Expected success signal

- Policy saves successfully
- Virtual Connection republishes successfully

### Failure signals

- Calculation validation fails
- Publish fails

### Next action if failure occurs

- Correct the email values and field names
- Re-check that `Region` is the mapped policy column

### Do not proceed until

The `rls_entitlement` policy is saved and published.

---

### Step 2.4 — Publish A Datasource Through The Virtual Connection

In Tableau Cloud:

1. Go to **Explore → New → Published Data Source**
2. Choose the Virtual Connection created above
3. Select the `Orders` table
4. Publish as `Sample - Superstore with VC policies`
5. Copy the datasource LUID from the datasource URL

Example URL pattern:

```text
https://<pod>.online.tableau.com/#/site/<site>/datasources/<DATASOURCE_LUID>/details
```

### Expected success signal

- Datasource is published
- You have the datasource LUID recorded

### Failure signal

Datasource cannot be published or LUID cannot be retrieved.

### Next action if failure occurs

Fix publish permissions, then retrieve the LUID from the datasource URL before continuing.

### Do not proceed until

You have a confirmed datasource LUID.

---

### Step 2.5 — Grant Datasource Permissions

For the published datasource, grant both demo users:

- **View**
- **Connect**
- **API Access**

### Expected success signal

Both users have API Access on the datasource.

### Failure signal

API Access is absent or unavailable.

### Next action if failure occurs

Adjust datasource permissions until API Access is explicitly granted.

### Do not proceed until

Both users have API Access.

---

## Step 3 — Generate Local Keys

Run:

```bash
npx tsx uat/scripts/generateKeys.ts
```

### Expected success signal

The script prints absolute paths for:

- `uat/keys/uat_private_key.pem`
- `uat/keys/uat_public_key.pem`
- `uat/keys/oauth_jwe_private_key.pem`

### Failure signal

The files are not created or the script exits non-zero.

### Next action if failure occurs

Resolve Node/npm issues, then re-run the script.

### Do not proceed until

All three key files exist.

---

## Step 4 — Register UAT In Tableau Cloud Manager

Create a TCM PAT in `https://cloudmanager.tableau.com`, then run:

```bash
SITE_NAME=<your-site-content-url> TCM_PAT_SECRET=<your-pat-secret> npx tsx uat/scripts/registerUat.ts
```

### Expected success signal

The script prints:

```text
UAT_TENANT_ID=<value>
UAT_ISSUER=<value>
```

### Failure signals

- `401` or login failure
- site not found
- missing public key file

### Next action if failure occurs

- Verify `TCM_PAT_SECRET`
- Verify `SITE_NAME` is the **contentUrl** slug, not display name
- Re-run key generation if `uat_public_key.pem` is missing

### Do not proceed until

You have confirmed `UAT_TENANT_ID` and `UAT_ISSUER`.

---

## Step 5 — Create `tests/.env`

Use the authoritative template:

```bash
cp tests/.env.example tests/.env
```

Then edit `tests/.env` so it contains valid values:

```bash
TRANSPORT=http
AUTH=uat
SERVER=https://<your-tableau-cloud-pod>.online.tableau.com/
SITE_NAME=<your-site-content-url>

UAT_TENANT_ID=<from-registerUat-output>
UAT_ISSUER=<from-registerUat-output>
UAT_USERNAME_CLAIM_NAME=email
UAT_USERNAME_CLAIM={OAUTH_USERNAME}
UAT_PRIVATE_KEY_PATH=./uat/keys/uat_private_key.pem

OAUTH_ISSUER=http://127.0.0.1:3927
OAUTH_JWE_PRIVATE_KEY_PATH=./uat/keys/oauth_jwe_private_key.pem

CREATOR_EMAIL=creator-user@example.com
VIEWER_EMAIL=viewer-user@example.com
DATASOURCE_LUID=<published-datasource-luid>

DEFAULT_LOG_LEVEL=debug
```

### Expected success signal

`tests/.env` exists and every placeholder has been replaced with a real value.

### Failure signals

- Placeholder values remain
- wrong key paths
- wrong `SITE_NAME`

### Next action if failure occurs

Correct `tests/.env` before validation.

### Do not proceed until

`tests/.env` is fully populated with real values.

---

## Step 6 — Run Preflight

Run:

```bash
npm run uat:check
```

### Expected success signal

All checks show `✓` and the script ends with:

```text
PASS — uat:check
```

### Failure signals

- missing env values
- missing key files
- port `3927` already in use

### Next action if failure occurs

Read the failing check and correct the exact issue, then re-run `npm run uat:check`.

### Do not proceed until

Preflight passes.

---

## Step 7 — Start The MCP Server

Run:

```bash
npm run uat:up
```

### Expected success signal

The server remains running and prints that it is listening on `http://127.0.0.1:3927`.

### Failure signals

- build failure
- server exits immediately
- port conflict

### Next action if failure occurs

- Fix the reported build or env issue
- If port `3927` is occupied, stop the conflicting process and re-run

### Do not proceed until

The server is actively listening on `127.0.0.1:3927`.

---

## Step 8 — Run The Automated RLS Proof

Open a second shell and run:

```bash
npx tsx --env-file=tests/.env uat/scripts/rlsValidate.ts
```

### Expected success signal

The output shows:

- Creator returns rows for `South` and `West`
- Viewer returns rows for `Central` and `East`
- verdict confirms Tableau Cloud enforced RLS at the data layer

### Failure signals

- one or both users return `0` rows
- both users return identical rows
- datasource call fails

### Next action if failure occurs

Use the troubleshooting section below. Do not declare the environment functional until this script proves differentiated results.

### Do not proceed until

`rlsValidate.ts` shows differentiated result sets for the two users.

---

## Step 9 — Optional Manual Proof With MCP Inspector

Only do this if you need a browser-based demonstration.

### Step 9.1 — Start Inspector

Open a new shell while the server from Step 7 is still running and execute:

```bash
nohup npx @modelcontextprotocol/inspector --config config.http.json --server tableau > /tmp/inspect.log 2>&1 &
sleep 3 && cat /tmp/inspect.log
```

### Expected success signal

The log contains a URL like:

```text
http://localhost:6274/?MCP_PROXY_AUTH_TOKEN=<token>
```

### Failure signal

Inspector does not start or the log remains empty.

### Next action if failure occurs

Wait a few seconds, re-check the log, or re-run the command.

### Important rule

Do **not** use `npm run uat:inspect` in this flow. That command starts another server and may conflict with the already-running instance on `3927`.

---

### Step 9.2 — Generate Test Tokens

Run:

```bash
npx tsx --env-file=tests/.env uat/scripts/generateTestTokens.ts
```

### Expected success signal

JSON output contains `creator` and `viewer` tokens.

---

### Step 9.3 — Authenticate And Compare

1. Open the Inspector URL in one browser window and authenticate as Creator with:
   - header name: `Authorization`
   - header value: `Bearer <creator token>`
2. Open the same Inspector URL in an incognito or separate browser profile and authenticate as Viewer with:
   - header name: `Authorization`
   - header value: `Bearer <viewer token>`
3. In both sessions, call `query-datasource` with:

```json
{
  "fields": [
    { "fieldCaption": "Region", "sortDirection": "ASC", "sortPriority": 1 },
    { "fieldCaption": "Sales", "function": "SUM" },
    { "fieldCaption": "Profit", "function": "SUM" }
  ]
}
```

and the same `datasourceLuid`.

### Expected success signal

- Creator sees only `South` and `West`
- Viewer sees only `Central` and `East`

### Failure signal

Both sessions show the same data.

### Next action if failure occurs

Use a true incognito window or separate browser profile to avoid shared session state.

---

## Troubleshooting

### `registerUat.ts` fails with `401` or login failure

Cause:

- invalid `TCM_PAT_SECRET`

Fix:

- create a new TCM PAT secret
- re-run the registration command

---

### `registerUat.ts` cannot find the site

Cause:

- `SITE_NAME` is wrong
- display name used instead of `contentUrl`

Fix:

- use the Tableau site `contentUrl` slug
- re-run the registration command

---

### `npm run uat:check` fails on key path

Cause:

- key files missing
- wrong path in `tests/.env`

Fix:

- re-run `npx tsx uat/scripts/generateKeys.ts`
- update `tests/.env` with the correct paths

---

### Port `3927` already in use

Cause:

- another server instance is running

Fix:

- stop the other process
- re-run `npm run uat:check`
- then re-run `npm run uat:up`

---

### One or both users return `0` rows

Cause candidates:

- API Access not granted
- wrong datasource LUID
- Data Policy missing the user email
- wrong `SITE_NAME`

Fix order:

1. Verify datasource permissions include API Access
2. Verify `DATASOURCE_LUID`
3. Verify the Virtual Connection Data Policy contains the correct emails
4. Verify `SITE_NAME` is the correct `contentUrl`

---

### Both users return identical rows

Cause candidates:

- Virtual Connection Data Policy not active
- same user identity used for both requests
- browser sessions not isolated in Inspector

Fix order:

1. Re-open the Virtual Connection and confirm `rls_entitlement` is published
2. Re-run `rlsValidate.ts`
3. If using Inspector, use a separate incognito/profile for the second user

---

### Datasource LUID is stale or wrong

Check with:

```bash
npx tsx --env-file=tests/.env uat/scripts/discoverDatasource.ts
```

If invalid:

- retrieve the current datasource LUID from Tableau Cloud
- update `DATASOURCE_LUID` in `tests/.env`
- re-run `rlsValidate.ts`

---

## Supporting References

These documents remain useful, but they are not the canonical execution path:

- `RUNBOOK-rls-customer-repro.md`
- `RUNBOOK-tableau-mcp-uat.md`
- `RUNBOOK-rls-demo.md`
- `RUNBOOK-rls-se-quickstart.md`
- `uat/docs/TABLEAU-USER-FILTER-SETUP.md` (archived; included only to document the non-working historical path)

If any supporting document conflicts with this runbook, follow **this** runbook.
