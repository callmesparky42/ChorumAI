"use strict";
/**
 * CLI CONFIGURATION
 *
 * Stores config in ~/.chorum/cli-config.json
 * Handles API URL, tokens, active project, etc.
 * Tokens are encrypted using AES-256-GCM with machine-specific keys
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfig = getConfig;
exports.saveConfig = saveConfig;
exports.updateConfig = updateConfig;
exports.getConfigValue = getConfigValue;
exports.setConfigValue = setConfigValue;
exports.clearConfig = clearConfig;
exports.isTokenExpired = isTokenExpired;
exports.getConfigPath = getConfigPath;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const crypto_1 = require("crypto");
const CONFIG_DIR = path.join(os.homedir(), '.chorum');
const CONFIG_FILE = path.join(CONFIG_DIR, 'cli-config.json');
// Derive encryption key from machine-specific data
const ENCRYPTION_KEY = (0, crypto_1.scryptSync)(`${os.hostname()}-${os.userInfo().username}`, 'chorum-cli-salt-v1', 32);
/**
 * Encrypt sensitive data using AES-256-GCM
 */
function encrypt(text) {
    const iv = (0, crypto_1.randomBytes)(16);
    const cipher = (0, crypto_1.createCipheriv)('aes-256-gcm', ENCRYPTION_KEY, iv);
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
function decrypt(encryptedText) {
    try {
        const { iv, data, tag } = JSON.parse(encryptedText);
        const decipher = (0, crypto_1.createDecipheriv)('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(iv, 'hex'));
        decipher.setAuthTag(Buffer.from(tag, 'hex'));
        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(data, 'hex')),
            decipher.final()
        ]);
        return decrypted.toString('utf8');
    }
    catch (err) {
        // If decryption fails, return original (for backward compatibility)
        return encryptedText;
    }
}
/**
 * Ensure config directory exists with secure permissions
 */
async function ensureConfigDir() {
    try {
        // Create with owner-only permissions (0o700)
        await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
    catch (err) {
        if (err.code !== 'EEXIST')
            throw err;
    }
    // Ensure existing directory has correct permissions
    try {
        await fs.chmod(CONFIG_DIR, 0o700);
    }
    catch (err) {
        // Ignore chmod errors (may not be supported on all systems)
    }
}
/**
 * Get current config
 */
async function getConfig() {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf-8');
        const config = JSON.parse(data);
        // Decrypt token if present
        if (config.apiToken) {
            config.apiToken = decrypt(config.apiToken);
        }
        return config;
    }
    catch (err) {
        if (err.code === 'ENOENT') {
            return {}; // No config yet
        }
        throw err;
    }
}
/**
 * Save config
 */
async function saveConfig(config) {
    await ensureConfigDir();
    // Encrypt token before saving
    const configToSave = { ...config };
    if (configToSave.apiToken) {
        configToSave.apiToken = encrypt(configToSave.apiToken);
    }
    // Write with owner-only permissions (0o600)
    await fs.writeFile(CONFIG_FILE, JSON.stringify(configToSave, null, 2), { mode: 0o600 });
}
/**
 * Update specific config values
 */
async function updateConfig(updates) {
    const config = await getConfig();
    const newConfig = { ...config, ...updates };
    await saveConfig(newConfig);
    return newConfig;
}
/**
 * Get a specific config value
 */
async function getConfigValue(key) {
    const config = await getConfig();
    return config[key];
}
/**
 * Set a specific config value
 */
async function setConfigValue(key, value) {
    const config = await getConfig();
    config[key] = value;
    await saveConfig(config);
}
/**
 * Clear config (logout)
 */
async function clearConfig() {
    try {
        await fs.unlink(CONFIG_FILE);
    }
    catch (err) {
        if (err.code !== 'ENOENT')
            throw err;
    }
}
/**
 * Check if token is expired
 */
async function isTokenExpired() {
    const config = await getConfig();
    if (!config.tokenExpiresAt)
        return true;
    return new Date(config.tokenExpiresAt) < new Date();
}
/**
 * Get config file path (for display)
 */
function getConfigPath() {
    return CONFIG_FILE;
}
//# sourceMappingURL=config.js.map