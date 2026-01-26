/**
 * Environment Variable Validation & Management
 *
 * Import this file early in the application to validate required env vars at startup.
 * This catches misconfiguration earlier than runtime errors.
 *
 * Also provides utilities for writing to .env.local when providers are added.
 */

import { promises as fs } from 'fs'
import path from 'path'

const requiredEnvVars = [
    'DATABASE_URL',
    'ENCRYPTION_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
] as const

const recommendedEnvVars = [
    'AUTH_SECRET',  // Required for NextAuth v5
] as const

export function validateEnv(): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = []
    const warnings: string[] = []

    // Check required vars
    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            errors.push(`Missing required environment variable: ${envVar}`)
        }
    }

    // Check recommended vars
    for (const envVar of recommendedEnvVars) {
        if (!process.env[envVar]) {
            warnings.push(`Missing recommended environment variable: ${envVar}`)
        }
    }

    // Validate ENCRYPTION_KEY format (should be 64 hex chars)
    if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length !== 64) {
        warnings.push('ENCRYPTION_KEY should be 64 hex characters (32 bytes). Current length: ' + process.env.ENCRYPTION_KEY.length)
    }

    // Check for at least one LLM provider
    const llmProviders = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_AI_API_KEY']
    const hasLlmProvider = llmProviders.some(key => process.env[key])
    if (!hasLlmProvider) {
        warnings.push('No LLM provider API key found. Set at least one of: ' + llmProviders.join(', '))
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    }
}

// Only run validation in development to avoid slow cold starts in production
if (process.env.NODE_ENV === 'development') {
    const result = validateEnv()

    if (result.warnings.length > 0) {
        console.warn('\n⚠️  Environment Warnings:')
        result.warnings.forEach(w => console.warn(`   - ${w}`))
    }

    if (!result.valid) {
        console.error('\n❌ Environment Errors:')
        result.errors.forEach(e => console.error(`   - ${e}`))
        console.error('\n   See .env.example for required variables.\n')
        // Don't throw in dev to allow partial functionality
    }
}

/**
 * Provider to environment variable name mapping
 */
const PROVIDER_ENV_KEYS: Record<string, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_AI_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
}

/**
 * Get the path to .env.local file
 */
function getEnvLocalPath(): string {
    return path.join(process.cwd(), '.env.local')
}

/**
 * Write or update an API key in .env.local
 *
 * @param provider - The provider name (e.g., 'anthropic', 'openai')
 * @param apiKey - The API key to write
 * @returns Success status and any error message
 */
export async function writeProviderKeyToEnv(
    provider: string,
    apiKey: string
): Promise<{ success: boolean; error?: string }> {
    // Only write for known cloud providers
    const envKey = PROVIDER_ENV_KEYS[provider.toLowerCase()]
    if (!envKey) {
        // Not a known provider or local provider - skip silently
        return { success: true }
    }

    // Don't write placeholder keys
    if (!apiKey || apiKey === 'not-required') {
        return { success: true }
    }

    const envPath = getEnvLocalPath()

    try {
        let content = ''

        // Read existing content if file exists
        try {
            content = await fs.readFile(envPath, 'utf-8')
        } catch {
            // File doesn't exist, start fresh
            content = '# ChorumAI Environment Variables\n\n'
        }

        // Check if the key already exists
        const keyRegex = new RegExp(`^${envKey}=.*$`, 'm')
        const keyExists = keyRegex.test(content)

        if (keyExists) {
            // Update existing key
            content = content.replace(keyRegex, `${envKey}=${apiKey}`)
        } else {
            // Append new key (ensure newline at end)
            if (!content.endsWith('\n')) {
                content += '\n'
            }
            content += `${envKey}=${apiKey}\n`
        }

        await fs.writeFile(envPath, content, 'utf-8')

        console.log(`[ENV] Wrote ${envKey} to .env.local`)
        return { success: true }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[ENV] Failed to write ${envKey} to .env.local:`, message)
        return { success: false, error: message }
    }
}

/**
 * Remove a provider's API key from .env.local
 *
 * @param provider - The provider name to remove
 */
export async function removeProviderKeyFromEnv(
    provider: string
): Promise<{ success: boolean; error?: string }> {
    const envKey = PROVIDER_ENV_KEYS[provider.toLowerCase()]
    if (!envKey) {
        return { success: true }
    }

    const envPath = getEnvLocalPath()

    try {
        const content = await fs.readFile(envPath, 'utf-8')

        // Remove the key line
        const keyRegex = new RegExp(`^${envKey}=.*\n?`, 'm')
        const newContent = content.replace(keyRegex, '')

        await fs.writeFile(envPath, newContent, 'utf-8')

        console.log(`[ENV] Removed ${envKey} from .env.local`)
        return { success: true }
    } catch (error) {
        // File doesn't exist or other error - that's fine
        return { success: true }
    }
}
