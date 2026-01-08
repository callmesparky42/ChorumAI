/**
 * Secure Fetch Wrapper
 * Handles TLS/SSL configuration for enterprise setups with custom certificates
 */

import https from 'https'
import type { SecuritySettings } from './security'

// Reusable agents to avoid creating new ones per request
let insecureAgent: https.Agent | null = null
let secureAgent: https.Agent | null = null

function getInsecureAgent(): https.Agent {
    if (!insecureAgent) {
        insecureAgent = new https.Agent({
            rejectUnauthorized: false
        })
    }
    return insecureAgent
}

function getSecureAgent(): https.Agent {
    if (!secureAgent) {
        secureAgent = new https.Agent({
            rejectUnauthorized: true
        })
    }
    return secureAgent
}

export interface SecureFetchOptions extends RequestInit {
    /**
     * Security settings from user preferences
     * When strictSsl is false, allows self-signed certificates
     */
    securitySettings?: SecuritySettings | null
}

/**
 * Fetch wrapper that respects SSL/TLS settings
 *
 * For enterprise users with:
 * - Self-signed certificates on internal Ollama/LM Studio deployments
 * - Corporate proxies with custom CA certs
 * - Development environments with self-signed certs
 *
 * Set strictSsl=false in security settings to bypass certificate validation.
 * WARNING: Only use this for trusted internal endpoints.
 */
export async function secureFetch(
    url: string | URL,
    options: SecureFetchOptions = {}
): Promise<Response> {
    const { securitySettings, ...fetchOptions } = options
    const urlString = url.toString()

    // Only apply custom agent for HTTPS URLs
    const isHttps = urlString.startsWith('https://')

    // Check if we should skip SSL verification
    const skipSslVerification = isHttps && securitySettings?.strictSsl === false

    if (skipSslVerification) {
        // Node.js fetch with custom agent requires undici dispatcher
        // For now, use node's native https module for these requests
        return fetchWithAgent(urlString, fetchOptions, getInsecureAgent())
    }

    // Default secure fetch (or HTTP which doesn't need TLS)
    return fetch(url, fetchOptions)
}

/**
 * Perform fetch with a custom HTTPS agent
 * Uses Node's native https module for proper agent support
 */
async function fetchWithAgent(
    url: string,
    options: RequestInit,
    agent: https.Agent
): Promise<Response> {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url)

        const requestOptions: https.RequestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 443,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: options.headers as Record<string, string>,
            agent
        }

        const req = https.request(requestOptions, (res) => {
            const chunks: Buffer[] = []

            res.on('data', (chunk: Buffer) => {
                chunks.push(chunk)
            })

            res.on('end', () => {
                const body = Buffer.concat(chunks)

                // Create a Response-like object
                const response = new Response(body, {
                    status: res.statusCode || 200,
                    statusText: res.statusMessage || '',
                    headers: new Headers(res.headers as Record<string, string>)
                })

                resolve(response)
            })
        })

        req.on('error', (err) => {
            reject(err)
        })

        // Handle timeout
        req.setTimeout(30000, () => {
            req.destroy()
            reject(new Error('Request timeout'))
        })

        // Write body if present
        if (options.body) {
            req.write(options.body)
        }

        req.end()
    })
}

/**
 * Create a fetch function pre-configured with security settings
 * Use this to create provider-specific fetchers
 */
export function createSecureFetcher(securitySettings: SecuritySettings | null) {
    return (url: string | URL, options: RequestInit = {}) => {
        return secureFetch(url, { ...options, securitySettings })
    }
}
