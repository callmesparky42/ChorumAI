/**
 * Import Project API
 * Endpoint: POST /api/import/project
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { importProject } from '@/lib/portability/importer'
import { validateExportPayload } from '@/lib/portability/validator'
import { scryptSync, createDecipheriv } from 'crypto'

/**
 * Decrypt data that was encrypted with encryptWithPassword
 */
function decryptWithPassword(encryptedBundle: string, password: string): string {
    // Split the bundle: salt.iv.authTag.ciphertext
    const parts = encryptedBundle.split('.')
    if (parts.length !== 4) {
        throw new Error('Invalid encrypted data format')
    }

    const [saltB64, ivB64, authTagB64, ciphertext] = parts

    const salt = Buffer.from(saltB64, 'base64')
    const iv = Buffer.from(ivB64, 'base64')
    const authTag = Buffer.from(authTagB64, 'base64')

    // Derive key using same scrypt parameters
    const key = scryptSync(password, salt, 32)

    // Create decipher
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)

    // Decrypt
    let decrypted = decipher.update(ciphertext, 'base64', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
}

export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const body = await req.json()
        let { exportData, options } = body

        if (!exportData) {
            return NextResponse.json({ error: 'Export data is required' }, { status: 400 })
        }

        // Check if the export is encrypted
        if (exportData._encrypted === true) {
            if (!options?.password) {
                return NextResponse.json({
                    error: 'This export is encrypted. Please provide the password.',
                    encrypted: true
                }, { status: 400 })
            }

            try {
                const decryptedJson = decryptWithPassword(exportData.data, options.password)
                exportData = JSON.parse(decryptedJson)
            } catch (decryptError) {
                console.error('Decryption failed:', decryptError)
                return NextResponse.json({
                    error: 'Failed to decrypt. Check your password.',
                    encrypted: true
                }, { status: 400 })
            }
        }

        // 1. Validate Schema
        const validation = validateExportPayload(exportData)
        if (!validation.valid || !validation.data) {
            return NextResponse.json({
                error: 'Invalid export file format',
                details: validation.error
            }, { status: 400 })
        }

        // 2. Perform Import
        const result = await importProject(session.user.id, validation.data, options || {})

        return NextResponse.json(result)

    } catch (error) {
        console.error('Import failed:', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Import failed' },
            { status: 500 }
        )
    }
}

