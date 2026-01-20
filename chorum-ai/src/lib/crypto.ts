import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey() {
    const keyHex = process.env.ENCRYPTION_KEY
    if (!keyHex) {
        throw new Error('ENCRYPTION_KEY is not set')
    }
    // If user provides 32-byte hex string
    if (keyHex.length === 64) {
        return Buffer.from(keyHex, 'hex')
    }
    // Fallback: If they provided a raw 32-char string (not recommended but possible)
    // or prompt for a generated one. 
    // For safety, let's assume they might put a random string and we hash it to 32 bytes?
    // No, strict hex is better. But for demo resilience:
    if (keyHex.length !== 64) {
        throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes).')
    }
    return Buffer.from(keyHex, 'hex')
}

export function encrypt(text: string): string {
    const key = getKey()
    const iv = randomBytes(16)
    const cipher = createCipheriv(ALGORITHM, key, iv)

    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    const authTag = cipher.getAuthTag().toString('hex')

    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag}:${encrypted}`
}

export function decrypt(text: string): string {
    const key = getKey()
    const parts = text.split(':')
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted string format')
    }

    const [ivHex, authTagHex, encryptedHex] = parts
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')

    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
}
