/**
 * RLS Validation Script
 *
 * Proves Tableau Cloud enforces Row-Level Security at the data layer.
 * Creates JWE tokens for two users, calls query-datasource identically,
 * and compares results.
 *
 * Usage:
 *   node --env-file=tests/.env build/index.js   # server must be running
 *   npx tsx --env-file=tests/.env uat/scripts/rlsValidate.ts
 *
 * Environment variables (all read from tests/.env with demo fallbacks):
 *   DATASOURCE_LUID  — LUID of the VC-backed datasource from Step 1.4
 *   CREATOR_EMAIL    — Tableau Cloud email for the Creator demo user
 *   VIEWER_EMAIL     — Tableau Cloud email for the Viewer demo user
 */

import { createToken } from '../lib/createToken.js';

const SERVER_URL = 'http://127.0.0.1:3927/tableau-mcp';
const DATASOURCE_LUID =
  process.env.DATASOURCE_LUID ??
  (() => {
    process.stderr.write(
      'Warning: DATASOURCE_LUID not set — using placeholder LUID. Configure tests/.env before running.\n',
    );
    return '<published-datasource-luid>';
  })();

const CREATOR_EMAIL =
  process.env.CREATOR_EMAIL ??
  (() => {
    process.stderr.write('Warning: CREATOR_EMAIL not set — using creator-user@example.com.\n');
    return 'creator-user@example.com';
  })();
const VIEWER_EMAIL =
  process.env.VIEWER_EMAIL ??
  (() => {
    process.stderr.write('Warning: VIEWER_EMAIL not set — using viewer-user@example.com.\n');
    return 'viewer-user@example.com';
  })();

const USERS = [
  { label: 'Creator', email: CREATOR_EMAIL },
  { label: 'Viewer', email: VIEWER_EMAIL },
];

const QUERY = {
  fields: [
    { fieldCaption: 'Region' },
    { fieldCaption: 'Sales', function: 'SUM' },
    { fieldCaption: 'Profit', function: 'SUM' },
  ],
};

function parseSseData(raw: string): unknown {
  // SSE streams contain multiple events. Result is the last data: line with "result" or "error".
  const dataLines = raw
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trim());

  // Iterate backwards to find last result
  for (let i = dataLines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(dataLines[i]);
      if ('result' in parsed || 'error' in parsed) {
        return parsed;
      }
    } catch {
      // Continue to next line
    }
  }

  throw new Error('No result data line found in SSE response');
}

function extractRegions(rows: unknown[]): string {
  return (rows as Record<string, unknown>[])
    .map((r) => String(r['Region'] ?? r['region'] ?? JSON.stringify(r)))
    .sort()
    .join(',');
}

async function mcpPost(
  token: string,
  sessionId: string | null,
  body: unknown,
): Promise<{ sessionId: string | null; data: unknown }> {
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
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${text}`);
  }

  const newSessionId = resp.headers.get('mcp-session-id');
  const text = await resp.text();
  return { sessionId: newSessionId ?? sessionId, data: parseSseData(text) };
}

async function runUser(
  label: string,
  email: string,
): Promise<{ label: string; email: string; rows: unknown[] }> {
  process.stdout.write(`\n── ${label} (${email}) ──\n`);

  const token = await createToken(email);

  // 1. Initialize
  const init = await mcpPost(token, null, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'rls-validate', version: '1.0' },
    },
  });
  process.stdout.write(`Session: ${init.sessionId}\n`);

  // 2. list-datasources — confirms Tableau auth succeeded independent of User Filter
  const listCall = await mcpPost(token, init.sessionId, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'list-datasources', arguments: {} },
  });
  const listResult = listCall.data as { result?: { content?: Array<{ text?: string }> } };
  const listText = listResult?.result?.content?.[0]?.text ?? '';
  try {
    const listParsed = JSON.parse(listText) as { datasources?: Array<{ id?: string }> };
    const dsCount = listParsed.datasources?.length ?? 0;
    const authNote =
      dsCount === 0
        ? ' (Viewer-role users cannot browse the datasource catalog — this is expected.' +
          ' Direct LUID queries are still possible and are tested below.)'
        : '';
    process.stdout.write(
      `Auth check — list-datasources: ${dsCount} datasource(s) visible${authNote}\n`,
    );
  } catch {
    process.stdout.write(`Auth check — list-datasources raw: ${listText.slice(0, 200)}\n`);
  }

  // 3. Call query-datasource
  const call = await mcpPost(token, init.sessionId, {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'query-datasource',
      arguments: { datasourceLuid: DATASOURCE_LUID, query: QUERY },
    },
  });

  const result = call.data as { result?: { content?: Array<{ text?: string }> } };
  const text = result?.result?.content?.[0]?.text ?? '';
  let rows: unknown[] = [];
  try {
    const parsed = JSON.parse(text) as { data?: unknown[]; warnings?: unknown };
    rows = parsed.data ?? [];
    if (rows.length === 0 && parsed.warnings) {
      process.stdout.write(`Warnings: ${JSON.stringify(parsed.warnings)}\n`);
    }
  } catch {
    process.stdout.write(`Raw response: ${text}\n`);
  }

  process.stdout.write(`Rows returned: ${rows.length}\n`);
  process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
  return { label, email, rows };
}

type UserRunResult = { label: string; email: string; rows: unknown[] };

async function main(): Promise<void> {
  process.stdout.write(`RLS Validation — ${new Date().toISOString()}\n`);
  process.stdout.write(`Datasource: ${DATASOURCE_LUID}\n`);
  process.stdout.write('Query: Region + SUM(Sales) + SUM(Profit)\n');

  const results: UserRunResult[] = [];
  for (const { label, email } of USERS) {
    results.push(await runUser(label, email));
  }

  process.stdout.write('\n════ COMPARISON ════\n');
  for (const { label, email, rows } of results) {
    process.stdout.write(`\n${label} (${email}): ${rows.length} region(s)\n`);
    for (const row of rows as Record<string, unknown>[]) {
      process.stdout.write(`  ${JSON.stringify(row)}\n`);
    }
  }

  const [creator, viewer] = results;
  process.stdout.write('\n════ VERDICT ════\n');

  // Check if either user got no data
  if (creator.rows.length === 0 || viewer.rows.length === 0) {
    for (const { label, rows } of [creator, viewer]) {
      if (rows.length === 0) {
        process.stdout.write(`⚠  ${label} returned 0 rows.\n`);
        process.stdout.write(
          `   Check: rls_entitlement VC Data Policy includes ${label} email in its USERNAME() condition.\n`,
        );
        process.stdout.write(
          `   Check: Datasource LUID is ${DATASOURCE_LUID} — confirm it is a VC datasource, not a regular one.\n`,
        );
        process.stdout.write(
          `   Check: ${label} has View + Connect + API Access permissions on the datasource in Tableau Cloud.\n`,
        );
      }
    }
    return;
  }

  // Both users got data - compare regions
  const creatorRegions = extractRegions(creator.rows);
  const viewerRegions = extractRegions(viewer.rows);

  if (creatorRegions === viewerRegions) {
    process.stdout.write('⚠  Same data returned for both users — RLS may not be active.\n');
    process.stdout.write(
      '   Both users see identical regions. Check that the rls_entitlement VC Data Policy\n',
    );
    process.stdout.write('   maps each user to different dimension values.\n');
  } else {
    process.stdout.write(
      `✓  Data differs: ${creator.label}=${creator.rows.length} row(s) vs ${viewer.label}=${viewer.rows.length} row(s)\n`,
    );
    process.stdout.write('✓  Tableau Cloud enforced RLS at the data layer.\n');
    process.stdout.write(
      '✓  The MCP server sent identical queries — filtering happened in Tableau.\n',
    );
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
