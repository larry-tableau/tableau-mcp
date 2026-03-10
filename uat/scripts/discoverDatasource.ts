/**
 * Validates the known datasource LUID by calling get-datasource-metadata via the MCP server.
 * If the LUID is still valid, prints the datasource name and field count.
 * If the LUID is invalid (datasource was republished with a new ID), prints a clear error.
 *
 * Usage: npx tsx --env-file=tests/.env uat/scripts/discoverDatasource.ts
 */

import { createPrivateKey, createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CompactEncrypt } from 'jose';

const SERVER_URL = process.env.MCP_SERVER_URL ?? 'http://127.0.0.1:3927/tableau-mcp';
const KNOWN_LUID = process.env.DATASOURCE_LUID ?? '<published-datasource-luid>';
const DS_NAME = process.env.DATASOURCE_NAME ?? 'Sample - Superstore with VC policies';
const AUDIENCE = 'tableau-mcp-server';
const ISSUER = process.env.OAUTH_ISSUER ?? 'http://127.0.0.1:3927';
const TABLEAU_SERVER = process.env.SERVER ?? 'https://<your-tableau-cloud-pod>.online.tableau.com/';
const JWE_KEY_PATH =
  process.env.OAUTH_JWE_PRIVATE_KEY_PATH ?? 'uat/keys/oauth_jwe_private_key.pem';
const TEST_EMAIL = process.env.CREATOR_EMAIL ?? 'creator-user@example.com';

async function createToken(): Promise<string> {
  const pem = readFileSync(JWE_KEY_PATH, 'utf8');
  const privateKey = createPrivateKey({ key: pem, format: 'pem' });
  const publicKey = createPublicKey(privateKey);
  const now = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({
    iss: ISSUER,
    aud: AUDIENCE,
    sub: TEST_EMAIL,
    clientId: 'discover-script',
    tableauServer: TABLEAU_SERVER,
    iat: now,
    exp: now + 3600,
  });
  return new CompactEncrypt(new TextEncoder().encode(payload))
    .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })
    .encrypt(publicKey);
}

function parseSseResult(raw: string): unknown {
  const resultLine = raw
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trim())
    .reverse()
    .find((l) => {
      try {
        const p = JSON.parse(l);
        return 'result' in p || 'error' in p;
      } catch {
        return false;
      }
    });
  if (!resultLine) throw new Error('No result line in SSE response');
  return JSON.parse(resultLine);
}

async function mcpPost(token: string, sessionId: string | null, body: unknown) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    Accept: 'application/json, text/event-stream',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  const resp = await fetch(SERVER_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
  const newSession = resp.headers.get('mcp-session-id');
  const text = await resp.text();
  return { sessionId: newSession ?? sessionId, data: parseSseResult(text) };
}

async function main(): Promise<void> {
  process.stdout.write(`Datasource LUID Validation\n`);
  process.stdout.write(`Known LUID: ${KNOWN_LUID}\n`);
  process.stdout.write(`Expected name: "${DS_NAME}"\n\n`);

  const token = await createToken();

  // Initialize session
  const init = await mcpPost(token, null, {
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'discover', version: '1.0' } },
  });

  // Call get-datasource-metadata with known LUID
  const meta = await mcpPost(token, init.sessionId, {
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'get-datasource-metadata', arguments: { datasourceLuid: KNOWN_LUID } },
  });

  const result = meta.data as {
    result?: { content?: Array<{ text?: string }> };
    error?: { message?: string };
  };

  if (result?.error) {
    process.stdout.write(`✗  MCP returned an error: ${result.error.message}\n`);
    process.stdout.write(`   The LUID is likely invalid. Republishing may have changed it.\n`);
    process.stdout.write(`   Action: locate the new LUID via Tableau Cloud site admin or\n`);
    process.stdout.write(`   the datasource URL, then update DATASOURCE_LUID in rlsValidate.ts\n`);
    process.stdout.write(`   and update datasources.md.\n`);
    return;
  }

  const text = result?.result?.content?.[0]?.text ?? '';
  try {
    const parsed = JSON.parse(text) as { fields?: unknown[]; parameters?: unknown[] };
    const fieldCount = parsed.fields?.length ?? 0;

    if (fieldCount > 0) {
      process.stdout.write(`✓  LUID is valid — datasource responded with metadata.\n`);
      process.stdout.write(`   LUID:   ${KNOWN_LUID}\n`);
      process.stdout.write(`   Fields: ${fieldCount}\n`);
      process.stdout.write(`\n   No changes needed in rlsValidate.ts or datasources.md.\n`);
    } else {
      process.stdout.write(`✗  Datasource returned no fields — LUID may be invalid.\n`);
      process.stdout.write(`   Raw: ${text.slice(0, 300)}\n`);
    }
  } catch {
    process.stdout.write(`Raw metadata response:\n${text.slice(0, 300)}\n`);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
