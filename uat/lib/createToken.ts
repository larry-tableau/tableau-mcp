import { createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CompactEncrypt } from 'jose';

const AUDIENCE = 'tableau-mcp-server';
const ISSUER = process.env.OAUTH_ISSUER ?? 'http://127.0.0.1:3927';
const TABLEAU_SERVER = process.env.SERVER ?? 'https://<your-tableau-cloud-pod>.online.tableau.com/';
const JWE_KEY_PATH = process.env.OAUTH_JWE_PRIVATE_KEY_PATH ?? 'uat/keys/oauth_jwe_private_key.pem';

export async function createToken(email: string): Promise<string> {
  const pem = readFileSync(JWE_KEY_PATH, 'utf8');
  const publicKey = createPublicKey({ key: pem, format: 'pem' });

  const now = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({
    iss: ISSUER,
    aud: AUDIENCE,
    sub: email,
    clientId: 'rls-validate-script',
    tableauServer: TABLEAU_SERVER,
    iat: now,
    exp: now + 3600,
  });

  return new CompactEncrypt(new TextEncoder().encode(payload))
    .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })
    .encrypt(publicKey);
}
