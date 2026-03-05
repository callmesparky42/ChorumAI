// src/__tests__/nebula/errors.test.ts
// Unit tests for NebulaError — pure logic, no mocks needed
import { describe, it, expect } from 'vitest'
import { NebulaError } from '@/lib/nebula/errors'

describe('NebulaError', () => {
    it('has name "NebulaError"', () => {
        const err = new NebulaError('NOT_FOUND', 'gone')
        expect(err.name).toBe('NebulaError')
    })

    it('preserves error code', () => {
        const err = new NebulaError('CONSTRAINT_VIOLATION', 'bad value')
        expect(err.code).toBe('CONSTRAINT_VIOLATION')
    })

    it('preserves message', () => {
        const err = new NebulaError('INVALID_INPUT', 'too long')
        expect(err.message).toBe('too long')
    })

    it('preserves optional cause', () => {
        const cause = new Error('pg: connection reset')
        const err = new NebulaError('INTERNAL', 'db error', cause)
        expect(err.cause).toBe(cause)
    })

    it('is an instance of Error', () => {
        const err = new NebulaError('TOKEN_INVALID', 'bad token')
        expect(err).toBeInstanceOf(Error)
    })

    it('covers all error codes', () => {
        // Ensures the type union is exercised — compile-time check via type assertion
        const codes = [
            'NOT_FOUND', 'CONSTRAINT_VIOLATION', 'INVALID_INPUT',
            'DUPLICATE_SCOPE_TAG', 'CROSS_LENS_DENIED',
            'TOKEN_INVALID', 'TOKEN_EXPIRED', 'TOKEN_REVOKED',
            'EMBEDDING_DIM_MISMATCH', 'INTERNAL',
        ] as const

        for (const code of codes) {
            const err = new NebulaError(code, `test: ${code}`)
            expect(err.code).toBe(code)
        }
    })
})
