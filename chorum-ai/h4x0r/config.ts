/**
 * CLI CONFIGURATION
 * 
 * Stores config in ~/.chorum/cli-config.json
 * Handles API URL, tokens, active project, etc.
 * Tokens are encrypted using AES-256-GCM with machine-specific keys
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

interface CliConfig {
  apiUrl?: string;
  apiToken?: string;
  tokenExpiresAt?: string;
  activeProject?: string;
  vaultUnlocked?: boolean;
  memoryCount?: number;

  // Display preferences
  crt?: boolean;
  amber?: boolean;
  typingSpeed?: number;
}

const CONFIG_DIR = path.join(os.homedir(), '.chorum');
const CONFIG_FILE = path.join(CONFIG_DIR, 'cli-config.json');

// Derive encryption key from machine-specific data
const ENCRYPTION_KEY = scryptSync(
  `${os.hostname()}-${os.userInfo().username}`,
  'chorum-cli-salt-v1',
  32
);

/**
 * Encrypt sensitive data using AES-256-GCM
 */
function encrypt(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('hex'),
    data: encrypted.toString('hex'),
    tag: authTag.toString('hex')
  });
}

/**
 * Decrypt sensitive data
 */
function decrypt(encryptedText: string): string {
  try {
    const { iv, data, tag } = JSON.parse(encryptedText);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      ENCRYPTION_KEY,
      Buffer.from(iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(data, 'hex')),
      decipher.final()
    ]);
    return decrypted.toString('utf8');
  } catch (err) {
    // If decryption fails, return original (for backward compatibility)
    return encryptedText;
  }
}

/**
 * Ensure config directory exists with secure permissions
 */
async function ensureConfigDir(): Promise<void> {
  try {
    // Create with owner-only permissions (0o700)
    await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  } catch (err: any) {
    if (err.code !== 'EEXIST') throw err;
  }

  // Ensure existing directory has correct permissions
  try {
    await fs.chmod(CONFIG_DIR, 0o700);
  } catch (err) {
    // Ignore chmod errors (may not be supported on all systems)
  }
}

/**
 * Get current config
 */
export async function getConfig(): Promise<CliConfig> {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(data);

    // Decrypt token if present
    if (config.apiToken) {
      config.apiToken = decrypt(config.apiToken);
    }

    return config;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return {}; // No config yet
    }
    throw err;
  }
}

/**
 * Save config
 */
export async function saveConfig(config: CliConfig): Promise<void> {
  await ensureConfigDir();

  // Encrypt token before saving
  const configToSave = { ...config };
  if (configToSave.apiToken) {
    configToSave.apiToken = encrypt(configToSave.apiToken);
  }

  // Write with owner-only permissions (0o600)
  await fs.writeFile(
    CONFIG_FILE,
    JSON.stringify(configToSave, null, 2),
    { mode: 0o600 }
  );
}

/**
 * Update specific config values
 */
export async function updateConfig(updates: Partial<CliConfig>): Promise<CliConfig> {
  const config = await getConfig();
  const newConfig = { ...config, ...updates };
  await saveConfig(newConfig);
  return newConfig;
}

/**
 * Get a specific config value
 */
export async function getConfigValue(key: keyof CliConfig): Promise<any> {
  const config = await getConfig();
  return config[key];
}

/**
 * Set a specific config value
 */
export async function setConfigValue(key: keyof CliConfig, value: any): Promise<void> {
  const config = await getConfig();
  (config as any)[key] = value;
  await saveConfig(config);
}

/**
 * Clear config (logout)
 */
export async function clearConfig(): Promise<void> {
  try {
    await fs.unlink(CONFIG_FILE);
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
}

/**
 * Check if token is expired
 */
export async function isTokenExpired(): Promise<boolean> {
  const config = await getConfig();
  if (!config.tokenExpiresAt) return true;
  return new Date(config.tokenExpiresAt) < new Date();
}

/**
 * Get config file path (for display)
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}
