/**
 * Cryptographic signing for content approval
 * Uses Ed25519 for fast, secure signatures
 */

import { createHash, generateKeyPairSync, sign, verify, createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

const KEY_FILE = '.content-kit-key';
const ALGORITHM = 'aes-256-gcm';

interface EncryptedKey {
  salt: string;
  iv: string;
  authTag: string;
  encrypted: string;
  publicKey: string;
}

/**
 * Generate a new Ed25519 keypair
 */
export function generateKeypair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

/**
 * Encrypt private key with password
 */
export function encryptPrivateKey(privateKey: string, password: string): EncryptedKey {
  const salt = randomBytes(32);
  const key = scryptSync(password, salt, 32);
  const iv = randomBytes(16);
  
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();
  
  // Generate public key for storage
  const { publicKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  
  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    encrypted,
    publicKey: '', // Will be set separately
  };
}

/**
 * Decrypt private key with password
 */
export function decryptPrivateKey(encryptedData: EncryptedKey, password: string): string {
  const salt = Buffer.from(encryptedData.salt, 'base64');
  const key = scryptSync(password, salt, 32);
  const iv = Buffer.from(encryptedData.iv, 'base64');
  const authTag = Buffer.from(encryptedData.authTag, 'base64');
  
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedData.encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Hash content for signing
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Sign content hash with private key
 */
export function signContent(content: string, privateKeyPem: string): string {
  const hash = hashContent(content);
  const signature = sign(null, Buffer.from(hash), privateKeyPem);
  return signature.toString('base64');
}

/**
 * Verify signature against content and public key
 */
export function verifySignature(content: string, signature: string, publicKeyPem: string): boolean {
  try {
    const hash = hashContent(content);
    const signatureBuffer = Buffer.from(signature, 'base64');
    return verify(null, Buffer.from(hash), publicKeyPem, signatureBuffer);
  } catch {
    return false;
  }
}

/**
 * Initialize secure signing (generate and store encrypted keypair)
 */
export async function initSecureSigning(cwd: string = process.cwd()): Promise<{ publicKey: string }> {
  const keyPath = join(cwd, KEY_FILE);
  
  if (existsSync(keyPath)) {
    throw new Error(`Key file already exists: ${keyPath}`);
  }
  
  // Prompt for password
  const password = await promptPassword('Create approval password (min 8 characters): ');
  const confirmPassword = await promptPassword('Confirm password: ');
  
  if (password !== confirmPassword) {
    throw new Error('Passwords do not match');
  }
  
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  
  // Generate keypair
  const { publicKey, privateKey } = generateKeypair();
  
  // Encrypt private key
  const salt = randomBytes(32);
  const key = scryptSync(password, salt, 32);
  const iv = randomBytes(16);
  
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();
  
  const encryptedKey: EncryptedKey = {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    encrypted,
    publicKey,
  };
  
  // Write key file
  writeFileSync(keyPath, JSON.stringify(encryptedKey, null, 2));
  chmodSync(keyPath, 0o600); // Only owner can read/write
  
  return { publicKey };
}

/**
 * Load public key from key file
 */
export function loadPublicKey(cwd: string = process.cwd()): string | null {
  const keyPath = join(cwd, KEY_FILE);
  if (!existsSync(keyPath)) {
    return null;
  }
  
  const data: EncryptedKey = JSON.parse(readFileSync(keyPath, 'utf8'));
  return data.publicKey;
}

/**
 * Sign content (prompts for password)
 */
export async function signWithPassword(content: string, cwd: string = process.cwd()): Promise<string> {
  const keyPath = join(cwd, KEY_FILE);
  
  if (!existsSync(keyPath)) {
    throw new Error('No signing key found. Run: content-kit init --secure');
  }
  
  const encryptedKey: EncryptedKey = JSON.parse(readFileSync(keyPath, 'utf8'));
  const password = await promptPassword('Enter approval password: ');
  
  try {
    const privateKey = decryptPrivateKey(encryptedKey, password);
    return signContent(content, privateKey);
  } catch (err) {
    throw new Error('Invalid password or corrupted key file');
  }
}

/**
 * Prompt for password (hidden input)
 */
function promptPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    // Hide input
    process.stdout.write(prompt);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    
    if (stdin.isTTY && stdin.setRawMode) {
      stdin.setRawMode(true);
    }
    
    let password = '';
    
    const onData = (char: Buffer) => {
      const c = char.toString('utf8');
      
      if (c === '\n' || c === '\r') {
        stdin.removeListener('data', onData);
        if (stdin.isTTY && stdin.setRawMode) {
          stdin.setRawMode(wasRaw ?? false);
        }
        process.stdout.write('\n');
        rl.close();
        resolve(password);
      } else if (c === '\u0003') {
        // Ctrl+C
        process.exit(1);
      } else if (c === '\u007F' || c === '\b') {
        // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
        }
      } else {
        password += c;
      }
    };
    
    stdin.on('data', onData);
  });
}

/**
 * Check if secure signing is set up
 */
export function isSecureSigningEnabled(cwd: string = process.cwd()): boolean {
  return existsSync(join(cwd, KEY_FILE));
}
