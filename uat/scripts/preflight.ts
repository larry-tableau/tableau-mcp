/**
 * UAT Preflight Validator
 *
 * Checks that the environment is correctly configured before starting the UAT server.
 * Mirrors the invariants in src/config.ts exactly — no stricter, no looser.
 *
 * Usage:
 *   npx tsx --env-file=tests/.env uat/scripts/preflight.ts
 *   npm run uat:check
 *
 * Exit: 0 = all checks pass, 1 = any check fails.
 */

import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_FILE = 'tests/.env';
const results: { label: string; pass: boolean }[] = [];

function check(label: string, pass: boolean): void {
  results.push({ label, pass });
}

async function isPortFree(port: number): Promise<boolean> {
  return new Promise((res) => {
    const s = createServer();
    s.once('error', () => res(false));
    s.once('listening', () => {
      s.close();
      res(true);
    });
    s.listen(port, '127.0.0.1');
  });
}

async function main(): Promise<void> {
  // 1. env file exists
  check(`${ENV_FILE} exists`, existsSync(ENV_FILE));

  // 2. AUTH must be 'uat' — wrong mode causes confusing downstream failures
  check("env AUTH === 'uat'", (process.env.AUTH ?? '') === 'uat');

  // 3. Required string keys
  for (const key of ['SERVER', 'SITE_NAME', 'UAT_TENANT_ID', 'UAT_ISSUER', 'OAUTH_ISSUER'] as const) {
    check(`env ${key} is set`, (process.env[key] ?? '').trim().length > 0);
  }

  // 4. Username claim: at least one of two options (matches config invariant)
  const hasClaim =
    (process.env.UAT_USERNAME_CLAIM ?? '').trim().length > 0 ||
    (process.env.JWT_SUB_CLAIM ?? '').trim().length > 0;
  check('env UAT_USERNAME_CLAIM or JWT_SUB_CLAIM is set', hasClaim);

  // 5. UAT private key: exactly one of PATH or inline value; if PATH, file must exist
  const uatPath = (process.env.UAT_PRIVATE_KEY_PATH ?? '').trim();
  const uatInline = (process.env.UAT_PRIVATE_KEY ?? '').trim();
  const uatBoth = uatPath.length > 0 && uatInline.length > 0;
  const uatNeither = uatPath.length === 0 && uatInline.length === 0;
  check(
    'UAT key: exactly one of UAT_PRIVATE_KEY_PATH or UAT_PRIVATE_KEY',
    !uatBoth && !uatNeither,
  );
  if (uatPath.length > 0) {
    check(`UAT_PRIVATE_KEY_PATH file exists (${uatPath})`, existsSync(resolve(uatPath)));
  }

  // 6. OAuth JWE key: exactly one of PATH or inline value; if PATH, file must exist
  const jwePath = (process.env.OAUTH_JWE_PRIVATE_KEY_PATH ?? '').trim();
  const jweInline = (process.env.OAUTH_JWE_PRIVATE_KEY ?? '').trim();
  const jweBoth = jwePath.length > 0 && jweInline.length > 0;
  const jweNeither = jwePath.length === 0 && jweInline.length === 0;
  check(
    'JWE key: exactly one of OAUTH_JWE_PRIVATE_KEY_PATH or OAUTH_JWE_PRIVATE_KEY',
    !jweBoth && !jweNeither,
  );
  if (jwePath.length > 0) {
    check(
      `OAUTH_JWE_PRIVATE_KEY_PATH file exists (${jwePath})`,
      existsSync(resolve(jwePath)),
    );
  }

  // 7. Port 3927 free — catches double-start silently
  check('port 3927 is free', await isPortFree(3927));

  // Print results and exit
  let allPass = true;
  for (const { label, pass } of results) {
    process.stdout.write(`  ${pass ? '✓' : '✗'}  ${label}\n`);
    if (!pass) allPass = false;
  }
  process.stdout.write(`\n${allPass ? 'PASS' : 'FAIL'} — uat:check\n`);
  process.exit(allPass ? 0 : 1);
}

main().catch((err: unknown) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
