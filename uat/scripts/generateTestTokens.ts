/**
 * Token Generator Script
 *
 * Generates JWE Bearer tokens for both RLS test users and outputs them as JSON.
 * Tokens are used to authenticate against the MCP Inspector or direct API calls.
 *
 * Usage:
 *   npx tsx --env-file=tests/.env uat/scripts/generateTestTokens.ts
 *
 * Output: { "creator": "<jwe>", "viewer": "<jwe>" }
 */

import { createToken } from '../lib/createToken.js';

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

async function main(): Promise<void> {
  const [creator, viewer] = await Promise.all([
    createToken(CREATOR_EMAIL),
    createToken(VIEWER_EMAIL),
  ]);

  process.stdout.write(JSON.stringify({ creator, viewer }, null, 2) + '\n');
}

main().catch((err: unknown) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
