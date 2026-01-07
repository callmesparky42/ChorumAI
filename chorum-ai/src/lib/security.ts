/**
 * Security utilities for ChorumAI
 * Implements backend enforcement for security settings
 */

import { db } from '@/lib/db'
import { auditLogs } from '@/lib/db/schema'

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
    model?: string
    projectId?: string
    details?: Record<string, unknown>
    securityFlags?: {
        httpsEnforced?: boolean
        piiAnonymized?: boolean
        sslValidated?: boolean
    }
}

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
 * Log an audit entry to the database
 * When logAllRequests is enabled, logs all LLM requests/responses
 */
export async function logAuditEntry(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void> {
    try {
        await db.insert(auditLogs).values({
            userId: entry.userId,
            action: entry.action,
            provider: entry.provider || null,
            endpoint: entry.endpoint || null,
            model: entry.model || null,
            projectId: entry.projectId || null,
            details: entry.details || null,
            securityFlags: entry.securityFlags || null
        })

        // Also log to console in development
        if (process.env.NODE_ENV === 'development') {
            console.log(`[AUDIT] ${entry.action}`, {
                userId: entry.userId,
                provider: entry.provider,
                endpoint: entry.endpoint,
                securityFlags: entry.securityFlags
            })
        }
    } catch (e) {
        // Log to console if DB write fails (don't break the request)
        console.warn('[AUDIT] Failed to persist audit log:', e)
    }
}

/**
 * Get recent audit log entries for a user from database
 */
export async function getAuditLog(userId: string, limit: number = 100): Promise<AuditLogEntry[]> {
    const { eq, desc } = await import('drizzle-orm')

    const logs = await db.select()
        .from(auditLogs)
        .where(eq(auditLogs.userId, userId))
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)

    return logs.map(log => ({
        timestamp: log.createdAt || new Date(),
        userId: log.userId,
        action: log.action,
        provider: log.provider || undefined,
        endpoint: log.endpoint || undefined,
        model: log.model || undefined,
        projectId: log.projectId || undefined,
        details: log.details || undefined,
        securityFlags: log.securityFlags || undefined
    }))
}

/**
 * Log an LLM request with security flags
 */
export async function logLlmRequest(
    userId: string,
    provider: string,
    endpoint: string,
    settings: SecuritySettings | null,
    additionalDetails?: Record<string, unknown>
): Promise<void> {
    if (!settings?.logAllRequests) {
        return
    }

    await logAuditEntry({
        userId,
        action: 'LLM_REQUEST',
        provider,
        endpoint,
        model: additionalDetails?.model as string | undefined,
        projectId: additionalDetails?.projectId as string | undefined,
        details: additionalDetails,
        securityFlags: {
            httpsEnforced: settings.enforceHttps,
            piiAnonymized: settings.anonymizePii,
            sslValidated: settings.strictSsl
        }
    })
}

/**
 * Export audit logs in a downloadable format
 */
export async function exportAuditLogs(userId: string): Promise<string> {
    const logs = await getAuditLog(userId, 1000)

    const lines = [
        '# ChorumAI Audit Log Export',
        `Generated: ${new Date().toISOString()}`,
        `User ID: ${userId}`,
        `Total Entries: ${logs.length}`,
        '',
        '---',
        ''
    ]

    for (const log of logs) {
        lines.push(`## ${log.action} - ${log.timestamp.toISOString()}`)
        if (log.provider) lines.push(`- **Provider:** ${log.provider}`)
        if (log.model) lines.push(`- **Model:** ${log.model}`)
        if (log.endpoint) lines.push(`- **Endpoint:** ${log.endpoint}`)
        if (log.projectId) lines.push(`- **Project:** ${log.projectId}`)
        if (log.securityFlags) {
            lines.push(`- **Security Flags:**`)
            lines.push(`  - HTTPS Enforced: ${log.securityFlags.httpsEnforced ?? 'N/A'}`)
            lines.push(`  - PII Anonymized: ${log.securityFlags.piiAnonymized ?? 'N/A'}`)
            lines.push(`  - SSL Validated: ${log.securityFlags.sslValidated ?? 'N/A'}`)
        }
        lines.push('')
    }

    return lines.join('\n')
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
