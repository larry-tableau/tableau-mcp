/**
 * Direct UAT auth diagnostic — bypasses the MCP layer.
 * Signs in to Tableau Cloud REST API directly with a UAT JWT.
 * Reports success/failure and lists datasources if auth works.
 *
 * Usage:
 *   npx tsx --env-file=tests/.env uat/scripts/diagAuth.ts
 */

import { readFileSync } from 'node:fs';
import { importPKCS8, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';

const SERVER = (process.env.SERVER ?? '').replace(/\/$/, '');
const SITE_NAME = process.env.SITE_NAME ?? '';
const UAT_TENANT_ID = process.env.UAT_TENANT_ID ?? '';
const UAT_ISSUER = process.env.UAT_ISSUER ?? '';
const UAT_USERNAME_CLAIM_NAME = process.env.UAT_USERNAME_CLAIM_NAME ?? 'email';
const UAT_PRIVATE_KEY_PATH = process.env.UAT_PRIVATE_KEY_PATH ?? '';
const DATASOURCE_LUID = process.env.DATASOURCE_LUID ?? '<published-datasource-luid>';

const USERS = [
  process.env.CREATOR_EMAIL ?? 'creator-user@example.com',
  process.env.VIEWER_EMAIL ?? 'viewer-user@example.com',
];

async function makeUatJwt(username: string): Promise<string> {
  const pem = readFileSync(UAT_PRIVATE_KEY_PATH, 'utf8');
  const privateKey = await importPKCS8(pem, 'RS256');
  const iat = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iat: iat - 5,
    exp: iat + 300,
    nbf: iat - 5,
    jti: `${UAT_ISSUER}-${iat}`,
    iss: UAT_ISSUER,
    scp: ['tableau:views:read', 'tableau:datasources:read', 'tableau:content:read'],
    [UAT_USERNAME_CLAIM_NAME]: username,
    'https://tableau.com/tenantId': UAT_TENANT_ID,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'uat-key-1' })
    .sign(privateKey);
}

async function signIn(username: string): Promise<{ token: string; siteId: string } | null> {
  const jwt = await makeUatJwt(username);
  const url = `${SERVER}/api/3.21/auth/signin`;
  const body = {
    credentials: {
      site: { contentUrl: SITE_NAME },
      isUat: true,
      jwt,
    },
  };
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  if (!resp.ok) {
    process.stdout.write(`  ✗ Sign-in failed (HTTP ${resp.status}): ${text.slice(0, 300)}\n`);
    return null;
  }
  const data = JSON.parse(text) as { credentials?: { token?: string; site?: { id?: string } } };
  const token = data.credentials?.token ?? '';
  const siteId = data.credentials?.site?.id ?? '';
  process.stdout.write(`  ✓ Sign-in OK — token: ${token.slice(0, 20)}...\n`);
  return { token, siteId };
}

async function listDatasources(token: string, siteId: string): Promise<number> {
  const url = `${SERVER}/api/3.21/sites/${siteId}/datasources?pageSize=10`;
  const resp = await fetch(url, {
    headers: { 'x-tableau-auth': token, Accept: 'application/json' },
  });
  const text = await resp.text();
  if (!resp.ok) {
    process.stdout.write(`  ✗ list-datasources failed (HTTP ${resp.status}): ${text.slice(0, 200)}\n`);
    return -1;
  }
  const data = JSON.parse(text) as { datasources?: { datasource?: unknown[] } };
  const count = data.datasources?.datasource?.length ?? 0;
  process.stdout.write(`  ✓ list-datasources: ${count} datasource(s) visible\n`);
  return count;
}

async function queryDatasource(token: string): Promise<void> {
  const url = `${SERVER}/api/v1/vizql-data-service/query-datasource`;
  const body = {
    datasource: { datasourceLuid: DATASOURCE_LUID },
    query: {
      fields: [
        { fieldCaption: 'Region', sortDirection: 'ASC', sortPriority: 1 },
        { fieldCaption: 'Sales', function: 'SUM' },
        { fieldCaption: 'Profit', function: 'SUM' },
      ],
    },
  };
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'x-tableau-auth': token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  if (!resp.ok) {
    process.stdout.write(`  ✗ query-datasource failed (HTTP ${resp.status}): ${text.slice(0, 400)}\n`);
    return;
  }
  const data = JSON.parse(text) as { data?: unknown[] };
  const rows = data.data ?? [];
  process.stdout.write(`  ✓ query-datasource: ${rows.length} row(s)\n`);
  if (rows.length > 0) process.stdout.write(`    ${JSON.stringify(rows)}\n`);
}

async function main(): Promise<void> {
  process.stdout.write(`UAT Auth Diagnostic — ${new Date().toISOString()}\n`);
  process.stdout.write(`Server: ${SERVER}\n`);
  process.stdout.write(`Site:   ${SITE_NAME}\n`);
  process.stdout.write(`Issuer: ${UAT_ISSUER}\n`);
  process.stdout.write(`Tenant: ${UAT_TENANT_ID}\n`);
  process.stdout.write(`Key:    ${UAT_PRIVATE_KEY_PATH}\n\n`);

  for (const email of USERS) {
    process.stdout.write(`── ${email} ──\n`);
    const session = await signIn(email);
    if (session) {
      await listDatasources(session.token, session.siteId);
      await queryDatasource(session.token);
    }
    process.stdout.write('\n');
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
