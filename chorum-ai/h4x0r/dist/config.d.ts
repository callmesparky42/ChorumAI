/**
 * CLI CONFIGURATION
 *
 * Stores config in ~/.chorum/cli-config.json
 * Handles API URL, tokens, active project, etc.
 * Tokens are encrypted using AES-256-GCM with machine-specific keys
 */
interface CliConfig {
    apiUrl?: string;
    apiToken?: string;
    tokenExpiresAt?: string;
    activeProject?: string;
    vaultUnlocked?: boolean;
    memoryCount?: number;
    crt?: boolean;
    amber?: boolean;
    typingSpeed?: number;
}
/**
 * Get current config
 */
export declare function getConfig(): Promise<CliConfig>;
/**
 * Save config
 */
export declare function saveConfig(config: CliConfig): Promise<void>;
/**
 * Update specific config values
 */
export declare function updateConfig(updates: Partial<CliConfig>): Promise<CliConfig>;
/**
 * Get a specific config value
 */
export declare function getConfigValue(key: keyof CliConfig): Promise<any>;
/**
 * Set a specific config value
 */
export declare function setConfigValue(key: keyof CliConfig, value: any): Promise<void>;
/**
 * Clear config (logout)
 */
export declare function clearConfig(): Promise<void>;
/**
 * Check if token is expired
 */
export declare function isTokenExpired(): Promise<boolean>;
/**
 * Get config file path (for display)
 */
export declare function getConfigPath(): string;
export {};
//# sourceMappingURL=config.d.ts.map