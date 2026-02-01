/**
 * Security Utils Tests
 */
import 'dotenv/config' // Load env vars
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { validateHttpsUrl, validateProviderEndpoint } from './security'

describe('Security Utils', () => {
    describe('validateHttpsUrl', () => {
        it('should accept valid HTTPS URLs', () => {
            const { valid, error } = validateHttpsUrl('https://api.anthropic.com/v1/messages')
            assert.strictEqual(valid, true)
            assert.strictEqual(error, undefined)
        })

        it('should reject HTTP URLs', () => {
            const { valid, error } = validateHttpsUrl('http://insecure-api.com')
            assert.strictEqual(valid, false)
            assert.ok(error?.includes('Insecure protocol'))
        })

        it('should accept localhost/127.0.0.1 (even with http)', () => {
            const localhost = validateHttpsUrl('http://localhost:11434')
            assert.strictEqual(localhost.valid, true)

            const ip = validateHttpsUrl('http://127.0.0.1:8080')
            assert.strictEqual(ip.valid, true)
        })

        it('should reject invalid URL strings', () => {
            const { valid, error } = validateHttpsUrl('not-a-url')
            assert.strictEqual(valid, false)
            assert.ok(error?.includes('Invalid URL format'))
        })
    })

    describe('validateProviderEndpoint', () => {
        it('should allow anything if endpoint is undefined', () => {
            const { valid } = validateProviderEndpoint(undefined, 'anthropic', { enforceHttps: true } as any)
            assert.strictEqual(valid, true)
        })

        it('should allow HTTP if enforceHttps is false', () => {
            const { valid } = validateProviderEndpoint('http://insecure.com', 'custom', { enforceHttps: false } as any)
            assert.strictEqual(valid, true)
        })

        it('should block HTTP if enforceHttps is true', () => {
            const { valid } = validateProviderEndpoint('http://insecure.com', 'custom', { enforceHttps: true } as any)
            assert.strictEqual(valid, false)
        })
    })
})
