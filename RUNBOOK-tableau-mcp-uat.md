# RUNBOOK: Tableau MCP — UAT Auth (Mode B)

> **Status:** Supporting reference only. The canonical rebuild and execution guide is [RUNBOOK-recreate-functional-state.md](RUNBOOK-recreate-functional-state.md). This document remains useful for focused UAT/OAuth detail, but it is not the authoritative end-to-end path.

**Mode B: HTTP + OAuth + UAT + `{OAUTH_USERNAME}`**

The MCP server runs as an HTTP OAuth 2.1 provider. When a user connects, they authenticate via
browser OAuth against Tableau Cloud. The server captures their email as `OAUTH_USERNAME` and
injects it as the `email` claim in a scoped UAT JWT. Tableau Cloud validates the JWT and creates
a session scoped to that user — RLS is enforced automatically.

> **Tableau Cloud constraint:** OAuth requires the local dev URL `http://127.0.0.1:3927`.
> This is the only supported local origin until Q2 2026. Do not change this value.

---

## Prerequisites

- Node.js >= 22.7.5
- `npm ci` run at repo root
- Access to Tableau Cloud site: `<your-site-content-url>`

---

## Step 1 — Generate RSA Key Pairs

```bash
npx tsx uat/scripts/generateKeys.ts
```

This creates three files under `uat/keys/` (gitignored):

| File | Purpose |
|---|---|
| `uat_private_key.pem` | Signs UAT JWTs (RS256) |
| `uat_public_key.pem` | Registered in Tableau Cloud UAT config |
| `oauth_jwe_private_key.pem` | Decrypts OAuth access tokens (RSA-OAEP-256 / A256GCM) |

The script prints the absolute paths and the public key to stdout.

---

## Step 2 — Register the UAT Configuration via TCM REST API

> **There is no UI for this.** UAT is distinct from Connected Apps (Direct Trust).
> Registration is done exclusively through the Tableau Cloud Manager (TCM) REST API
> at `cloudmanager.tableau.com`. Use the provided script — it handles the multi-line
> PEM key in JSON correctly and prints the exact env var values you need.

### Get a TCM personal access token

TCM PATs are created **via UI** (not API). You must be a **Tableau Cloud Manager cloud administrator** (tenant-level role, separate from Tableau Cloud site admin).

1. Sign in to `https://cloudmanager.tableau.com`
2. Click your profile image → **My Account Settings**
3. Under **Personal Access Tokens**, click **Create Token**
4. Copy the name and secret — the secret is shown **only once**

If you cannot reach `cloudmanager.tableau.com` or don't see the PAT option, you do not have TCM cloud admin access. Ask your org's Tableau Cloud administrator to run the registration script on your behalf.

### Run the registration script

```bash
SITE_NAME=<your-site-content-url> TCM_PAT_SECRET=<your-pat-secret> npx tsx uat/scripts/registerUat.ts
```

The script:
1. Signs in to the TCM REST API with your PAT
2. Finds the site ID for your configured `SITE_NAME` automatically
3. Creates the UAT configuration with `uat/keys/uat_public_key.pem`
4. Prints the `UAT_TENANT_ID` and `UAT_ISSUER` values to paste into `tests/.env`

Optional env vars for the script:

| Var | Default | Description |
|---|---|---|
| `SITE_NAME` | `<your-site-content-url>` | Content URL of the target site. This runbook assumes a named site with a non-empty slug. |
| `UAT_ISSUER_URI` | `https://mcp.tableau.com/uat` | Any unique URI — becomes `UAT_ISSUER` |
| `UAT_NAME` | `tableau-mcp-uat` | Display name for the UAT config in TCM |

### After the script runs

Copy the two printed lines into `tests/.env`:

```
UAT_TENANT_ID=<printed by script>
UAT_ISSUER=<printed by script>
```

---

## Step 3 — Configure Environment

Start from `tests/.env.example`, copy it to `tests/.env`, then add the UAT values from the
registration script output.
After Step 2, add the `UAT_TENANT_ID` and `UAT_ISSUER` values printed by the script.

The complete `tests/.env` should look like:

```
TRANSPORT=http
AUTH=uat
SERVER=https://<your-tableau-cloud-pod>.online.tableau.com/
SITE_NAME=<your-site-content-url>

UAT_TENANT_ID=<from registerUat.ts output>
UAT_ISSUER=<from registerUat.ts output>
UAT_USERNAME_CLAIM_NAME=email
UAT_USERNAME_CLAIM={OAUTH_USERNAME}
UAT_PRIVATE_KEY_PATH=./uat/keys/uat_private_key.pem

OAUTH_ISSUER=http://127.0.0.1:3927
OAUTH_JWE_PRIVATE_KEY_PATH=./uat/keys/oauth_jwe_private_key.pem

DEFAULT_LOG_LEVEL=debug
```

> **Key paths** are pre-populated in `tests/.env.example`. If you regenerate keys, update the
> copied `tests/.env` paths to match the new output.
> If you regenerate keys, update these paths to match the new output.

---

## Step 4 — Build and Start the MCP Server

Run preflight checks, build, and start in one command:

```bash
npm run uat:up
```

The server starts and listens on `http://127.0.0.1:3927` (foreground — keep this terminal open).

> **`uat:up`** runs `uat:check` → `build` → `node --env-file=tests/.env build/index.js`.
> Plain `node build/index.js` fails with `SERVER is not set` — always use `uat:up` or supply `--env-file`.

---

## Step 5 — Run Automated Scope Tests (No Network Required)

```bash
npm run test:e2e -- uatScopes
```

These tests use in-memory key pairs (no Tableau Cloud connection needed). Each test asserts
that `getJwt()` produces a JWT whose `scp` claim matches exactly the minimum scopes declared
for that tool. All 16 tools are covered.

Expected output: all tests pass.

---

## Step 6 — Authenticate via MCP Inspector

Stop the server from Step 4 (press `Ctrl+C`), then start server + Inspector together:

```bash
npm run uat:inspect
```

Or for a full first-run (preflight + build + server + Inspector in one command):

```bash
npm run uat:inspect:full
```

1. In the Inspector UI, set the server URL to `http://127.0.0.1:3927`.
2. Click **Connect** — the Inspector opens a browser window.
3. Complete the Tableau Cloud OAuth login flow.
4. Confirm the Inspector session shows the authenticated user's email.

Alternatively, connect Claude Desktop or Cursor to `http://127.0.0.1:3927`.

---

## Step 7 — Verify RLS

Call `list-workbooks` via the Inspector or an MCP client:

```json
{ "name": "list-workbooks", "arguments": {} }
```

The results must show only workbooks the authenticated user has permission to see.
Sign in as a different user and repeat — the result set must differ according to RLS rules.

---

## Verification Summary

| Check | Command |
|---|---|
| Key generation | `npx tsx uat/scripts/generateKeys.ts` |
| Environment preflight | `npm run uat:check` |
| Build | `npm run build` |
| Build + start server (headless) | `npm run uat:up` |
| Start server + Inspector | `npm run uat:inspect` (or `uat:inspect:full` for first run) |
| Lint | `npm run lint` |
| Scope tests (no network) | `npm run test:e2e -- uatScopes` |
| Full auth + RLS | Steps 5–7 above |

---

## Troubleshooting

**`registerUat.ts` fails with 401 or "not found"**
→ Check `TCM_PAT_SECRET` is correct. Only the secret is used — the PAT name is not sent to the TCM login endpoint. The PAT must be a Tableau Cloud Manager PAT, not a Tableau Cloud site PAT — create it at `https://cloudmanager.tableau.com`.

**`registerUat.ts` fails with "Site not found"**
→ Set `SITE_NAME=<contentUrl>` matching the exact `contentUrl` value from the TCM `/sites` response.

**`OAUTH_JWE_PRIVATE_KEY_PATH` not set — server fails to start**
→ Run key generation (Step 1) and fill in the path in your `.env`.

**OAuth callback fails with `redirect_uri_mismatch`**
→ Ensure `OAUTH_ISSUER=http://127.0.0.1:3927` exactly (no trailing slash, `http` not `https`).

**`401 Unauthorized` on tool calls**
→ Check `UAT_PRIVATE_KEY_PATH` points to the correct key and that the public key registered
in Tableau Cloud matches `uat/keys/uat_public_key.pem` from the same key generation run.

**RLS not applied (all users see the same data)**
→ Verify `UAT_USERNAME_CLAIM={OAUTH_USERNAME}` and `UAT_USERNAME_CLAIM_NAME=email` in your env.
The `email` claim in the JWT must match the Tableau Cloud username for that user.

---

## UAT Dashboard

Open `uat/dashboard/index.html` in a browser for an interactive setup checklist, auth flow
diagram, tool-to-scope table, and RLS explainer.
