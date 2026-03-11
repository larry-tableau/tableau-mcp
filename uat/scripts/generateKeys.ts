import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const keysDir = resolve(__dirname, '../keys');
mkdirSync(keysDir, { recursive: true });

function generateRsaKeyPair(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { privateKeyPem: privateKey as string, publicKeyPem: publicKey as string };
}

const uat = generateRsaKeyPair();
const oauthJwe = generateRsaKeyPair();

const uatPrivatePath = resolve(keysDir, 'uat_private_key.pem');
const uatPublicPath = resolve(keysDir, 'uat_public_key.pem');
const oauthJwePrivatePath = resolve(keysDir, 'oauth_jwe_private_key.pem');

writeFileSync(uatPrivatePath, uat.privateKeyPem, { encoding: 'utf-8' });
writeFileSync(uatPublicPath, uat.publicKeyPem, { encoding: 'utf-8' });
writeFileSync(oauthJwePrivatePath, oauthJwe.privateKeyPem, { encoding: 'utf-8' });

const out = [
  'Keys generated successfully.',
  '',
  'UAT signing key (RS256):',
  `  Private : ${uatPrivatePath}`,
  `  Public  : ${uatPublicPath}`,
  '',
  'OAuth JWE decryption key (RSA-OAEP-256 / A256GCM):',
  `  Private : ${oauthJwePrivatePath}`,
  '',
  '--- Paste this public key into Tableau Cloud UAT configuration ---',
  '',
  uat.publicKeyPem,
  '------------------------------------------------------------------',
  '',
  'Next steps:',
  '  1. Register the public key above in Tableau Cloud under UAT configuration.',
  '  2. Copy tests/.env.example -> tests/.env (authoritative template).',
  `  3. Set UAT_PRIVATE_KEY_PATH=${uatPrivatePath}`,
  `  4. Set OAUTH_JWE_PRIVATE_KEY_PATH=${oauthJwePrivatePath}`,
  '',
].join('\n');

process.stdout.write(out);
