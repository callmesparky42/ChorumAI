/**
 * Export Project API
 * Endpoint: POST /api/export/project
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exportProject } from '@/lib/portability/exporter'
import { randomBytes, scryptSync, createCipheriv } from 'crypto'

/**
 * Encrypt data using AES-256-GCM with password-derived key
 */
function encryptWithPassword(data: string, password: string): string {
    // Generate salt for key derivation
    const salt = randomBytes(16)

    // Derive key using scrypt (memory-hard, good for passwords)
    const key = scryptSync(password, salt, 32) // 256-bit key

    // Generate IV for AES-GCM
    const iv = randomBytes(12) // 96 bits recommended for GCM

    // Create cipher
    const cipher = createCipheriv('aes-256-gcm', key, iv)

    // Encrypt
    let encrypted = cipher.update(data, 'utf8', 'base64')
    encrypted += cipher.final('base64')

    // Get auth tag (for integrity)
    const authTag = cipher.getAuthTag()

    // Combine: salt (16) + iv (12) + authTag (16) + ciphertext
    // All base64 encoded and joined with periods
    return [
        salt.toString('base64'),
        iv.toString('base64'),
        authTag.toString('base64'),
        encrypted
    ].join('.')
}

export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const body = await req.json()
        const { projectId, options } = body

        if (!projectId) {
            return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
        }

        const payload = await exportProject(session.user.id, projectId, options)
        const jsonData = JSON.stringify(payload, null, 2)

        // Check if encryption is requested
        const shouldEncrypt = options?.encrypt === true && options?.password

        let outputData: string
        let contentType: string
        let fileExtension: string

        if (shouldEncrypt) {
            // Encrypt the JSON data
            const encryptedData = encryptWithPassword(jsonData, options.password)

            // Wrap in a container that indicates this is encrypted
            outputData = JSON.stringify({
                _encrypted: true,
                _version: 1,
                _algorithm: 'aes-256-gcm',
                _keyDerivation: 'scrypt',
                data: encryptedData
            }, null, 2)

            contentType = 'application/json'
            fileExtension = '.encrypted.json'
        } else {
            outputData = jsonData
            contentType = 'application/json'
            fileExtension = '.json'
        }

        // Create filename based on project name and date
        const sanitizedTitle = payload.project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()
        const date = new Date().toISOString().split('T')[0]
        const filename = `chorum_project_${sanitizedTitle}_${date}${fileExtension}`

        // Return as downloadable file
        return new NextResponse(outputData, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${filename}"`
            }
        })

    } catch (error) {
        console.error('Export failed:', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Export failed' },
            { status: 500 }
        )
    }
}

