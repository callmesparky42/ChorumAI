/**
 * Security utilities for ChorumAI
 * Implements backend enforcement for security settings
 */

export interface SecuritySettings {
    enforceHttps: boolean
    anonymizePii: boolean
    strictSsl: boolean
    logAllRequests: boolean
}

export interface AuditLogEntry {
    timestamp: Date
    userId: string
    action: string
    provider?: string
    endpoint?: string
    details?: Record<string, unknown>
    securityFlags?: {
        httpsEnforced?: boolean
        piiAnonymized?: boolean
        sslValidated?: boolean
    }
}

// In-memory audit log buffer (in production, this would go to persistent storage)
const auditBuffer: AuditLogEntry[] = []
const MAX_AUDIT_BUFFER = 1000

/**
 * Validates that a URL uses HTTPS protocol
 * Used when enforceHttps setting is enabled
 */
export function validateHttpsUrl(url: string): { valid: boolean; error?: string } {
    try {
        const parsed = new URL(url)

        // Allow localhost/127.0.0.1 for local development and Ollama
        if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
            return { valid: true }
        }

        // Require HTTPS for all external URLs
        if (parsed.protocol !== 'https:') {
            return {
                valid: false,
                error: `Insecure protocol rejected: "${parsed.protocol}" - HTTPS is required for external endpoints. URL: ${url}`
            }
        }

        return { valid: true }
    } catch (e) {
        return {
            valid: false,
            error: `Invalid URL format: ${url}`
        }
    }
}

/**
 * Validates provider endpoint URL based on security settings
 */
export function validateProviderEndpoint(
    baseUrl: string | undefined,
    provider: string,
    settings: SecuritySettings | null
): { valid: boolean; error?: string } {
    // If no baseUrl or HTTPS enforcement disabled, allow
    if (!baseUrl || !settings?.enforceHttps) {
        return { valid: true }
    }

    return validateHttpsUrl(baseUrl)
}

/**
 * Get default node TLS configuration based on strict SSL setting
 * When strictSsl is enabled, we reject self-signed certificates
 */
export function getTlsConfig(settings: SecuritySettings | null): { rejectUnauthorized: boolean } {
    return {
        rejectUnauthorized: settings?.strictSsl ?? true
    }
}

/**
 * Log an audit entry
 * When logAllRequests is enabled, logs all LLM requests/responses
 */
export function logAuditEntry(entry: Omit<AuditLogEntry, 'timestamp'>): void {
    const fullEntry: AuditLogEntry = {
        ...entry,
        timestamp: new Date()
    }

    // Add to buffer
    auditBuffer.push(fullEntry)

    // Rotate buffer if too large
    if (auditBuffer.length > MAX_AUDIT_BUFFER) {
        auditBuffer.shift()
    }

    // Also log to console in development
    if (process.env.NODE_ENV === 'development') {
        console.log(`[AUDIT] ${fullEntry.action}`, {
            userId: fullEntry.userId,
            provider: fullEntry.provider,
            endpoint: fullEntry.endpoint,
            securityFlags: fullEntry.securityFlags
        })
    }
}

/**
 * Get recent audit log entries for a user
 */
export function getAuditLog(userId: string, limit: number = 50): AuditLogEntry[] {
    return auditBuffer
        .filter(entry => entry.userId === userId)
        .slice(-limit)
}

/**
 * Log an LLM request with security flags
 */
export function logLlmRequest(
    userId: string,
    provider: string,
    endpoint: string,
    settings: SecuritySettings | null,
    additionalDetails?: Record<string, unknown>
): void {
    if (!settings?.logAllRequests) {
        return
    }

    logAuditEntry({
        userId,
        action: 'LLM_REQUEST',
        provider,
        endpoint,
        details: additionalDetails,
        securityFlags: {
            httpsEnforced: settings.enforceHttps,
            piiAnonymized: settings.anonymizePii,
            sslValidated: settings.strictSsl
        }
    })
}

/**
 * Security check summary for a request
 * Returns warnings/errors based on current settings
 */
export function performSecurityChecks(
    settings: SecuritySettings | null,
    providerBaseUrl: string | undefined,
    provider: string
): { passed: boolean; warnings: string[]; errors: string[] } {
    const warnings: string[] = []
    const errors: string[] = []

    // Check HTTPS enforcement
    if (settings?.enforceHttps && providerBaseUrl) {
        const httpsCheck = validateHttpsUrl(providerBaseUrl)
        if (!httpsCheck.valid) {
            errors.push(httpsCheck.error!)
        }
    }

    // Warning if security features disabled
    if (!settings?.enforceHttps) {
        warnings.push('HTTPS enforcement is disabled - requests may use insecure connections')
    }

    if (!settings?.anonymizePii) {
        warnings.push('PII anonymization is disabled - personal data may be sent to LLM providers')
    }

    if (!settings?.strictSsl) {
        warnings.push('Strict SSL is disabled - self-signed certificates will be accepted')
    }

    if (!settings?.logAllRequests) {
        warnings.push('Audit logging is disabled - requests/responses will not be logged')
    }

    return {
        passed: errors.length === 0,
        warnings,
        errors
    }
}
