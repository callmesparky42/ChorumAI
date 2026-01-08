/**
 * Environment Variable Validation
 * 
 * Import this file early in the application to validate required env vars at startup.
 * This catches misconfiguration earlier than runtime errors.
 */

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
