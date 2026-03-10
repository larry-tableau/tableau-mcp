/**
 * Registers a UAT configuration in Tableau Cloud Manager (TCM) REST API.
 *
 * Usage:
 *   TCM_PAT_SECRET=<secret> npx tsx uat/scripts/registerUat.ts
 *
 * Required env vars:
 *   SITE_NAME      Your Tableau Cloud site contentUrl slug. Set to blank (SITE_NAME=) for the Default site.
 *
 * Optional env vars:
 *   UAT_ISSUER_URI (default: https://mcp.tableau.com/uat  — any unique URI you choose)
 *   UAT_NAME       (default: tableau-mcp-uat)
 *
 * Outputs the UAT_TENANT_ID and UAT_ISSUER values to paste into tests/.env.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TCM_BASE = 'https://cloudmanager.tableau.com/api/v1';

const PAT_SECRET = process.env.TCM_PAT_SECRET;
const SITE_NAME = process.env.SITE_NAME;
const UAT_ISSUER_URI = process.env.UAT_ISSUER_URI ?? 'https://mcp.tableau.com/uat';
const UAT_NAME = process.env.UAT_NAME ?? 'tableau-mcp-uat';

if (!SITE_NAME && SITE_NAME !== '') {
  process.stderr.write(
    'Error: SITE_NAME is not set. Set it to your Tableau Cloud site contentUrl slug.\n' +
      'For the Default site, set SITE_NAME= (blank value).\n' +
      'Usage: SITE_NAME=<slug> TCM_PAT_SECRET=<secret> npx tsx uat/scripts/registerUat.ts\n',
  );
  process.exit(1);
}

if (!PAT_SECRET) {
  process.stderr.write(
    'Error: TCM_PAT_SECRET must be set.\n' +
      'Usage: TCM_PAT_SECRET=<secret> npx tsx uat/scripts/registerUat.ts\n',
  );
  process.exit(1);
}

const publicKeyPath = resolve(__dirname, '../keys/uat_public_key.pem');
let publicKey: string;
try {
  publicKey = readFileSync(publicKeyPath, 'utf-8');
} catch {
  process.stderr.write(
    `Error: could not read ${publicKeyPath}\nRun 'npx tsx uat/scripts/generateKeys.ts' first.\n`,
  );
  process.exit(1);
}

async function tcmPost<T>(path: string, body: unknown, sessionToken?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sessionToken) headers['x-tableau-session-token'] = sessionToken;

  const res = await fetch(`${TCM_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TCM API ${path} failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

async function tcmGet<T>(path: string, sessionToken: string): Promise<T> {
  const res = await fetch(`${TCM_BASE}${path}`, {
    headers: { 'x-tableau-session-token': sessionToken },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TCM API ${path} failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

interface LoginResponse {
  sessionToken: string;
  tenantId: string;
}

interface Site {
  siteUUID: string;
  name: string;
  contentUrl: string;
}

interface SitesResponse {
  sites: Site[];
}

interface UatConfigResponse {
  id: string;
  tenantId: string;
  issuer: string;
  name: string;
}

async function main(): Promise<void> {
  // Step 1: Sign in to TCM REST API
  process.stdout.write('Signing in to Tableau Cloud Manager REST API...\n');
  const login = await tcmPost<LoginResponse>('/pat/login', { token: PAT_SECRET });
  const sessionToken = login.sessionToken;
  process.stdout.write(`Signed in. Tenant ID: ${login.tenantId}\n`);

  // Step 2: Find the site ID
  process.stdout.write(`Looking up site: ${SITE_NAME}...\n`);
  const sites = await tcmGet<SitesResponse>(`/tenants/${login.tenantId}/sites`, sessionToken);
  const site = sites.sites.find((s) => s.contentUrl === SITE_NAME || s.name === SITE_NAME);
  if (!site) {
    const names = sites.sites.map((s) => `${s.name} (contentUrl: ${s.contentUrl})`).join('\n  ');
    throw new Error(`Site "${SITE_NAME}" not found. Available sites:\n  ${names}`);
  }
  process.stdout.write(`Found site: ${site.name} (id: ${site.siteUUID})\n`);

  // Step 3: Create UAT configuration
  process.stdout.write(`Creating UAT configuration "${UAT_NAME}"...\n`);
  const uatConfig = await tcmPost<UatConfigResponse>(
    '/uat-configurations',
    {
      name: UAT_NAME,
      issuer: UAT_ISSUER_URI,
      publicKey,
      usernameClaim: 'email',
      resourceIds: [site.siteUUID],
      enabled: true,
    },
    sessionToken,
  );

  const out = [
    '',
    '=== UAT Configuration Created ===',
    '',
    `Name     : ${uatConfig.name}`,
    `ID       : ${uatConfig.id}`,
    `Issuer   : ${uatConfig.issuer}`,
    `TenantId : ${uatConfig.tenantId}`,
    '',
    '--- Paste these values into tests/.env ---',
    '',
    `UAT_TENANT_ID=${uatConfig.tenantId}`,
    `UAT_ISSUER=${uatConfig.issuer}`,
    '',
    '------------------------------------------',
    '',
  ].join('\n');

  process.stdout.write(out);
}

main().catch((err: unknown) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
