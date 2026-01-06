/**
 * PII Detection and Anonymization Utility
 *
 * Detects and masks personally identifiable information before sending to LLMs.
 * Patterns detected:
 * - Credit card numbers (with Luhn validation)
 * - Social Security Numbers (SSN)
 * - Email addresses
 * - Phone numbers (US formats)
 */

// Luhn algorithm to validate credit card numbers
function isValidLuhn(digits: string): boolean {
    const nums = digits.replace(/\D/g, '').split('').map(Number)
    if (nums.length < 13 || nums.length > 19) return false

    let sum = 0
    let isSecond = false

    for (let i = nums.length - 1; i >= 0; i--) {
        let digit = nums[i]
        if (isSecond) {
            digit *= 2
            if (digit > 9) digit -= 9
        }
        sum += digit
        isSecond = !isSecond
    }

    return sum % 10 === 0
}

interface PiiMatch {
    type: 'credit_card' | 'ssn' | 'email' | 'phone'
    original: string
    masked: string
    confidence: 'high' | 'medium'
}

interface AnonymizeResult {
    text: string
    matches: PiiMatch[]
    wasModified: boolean
}

/**
 * Anonymize PII in text
 * Returns the anonymized text and metadata about what was found
 */
export function anonymizePii(text: string): AnonymizeResult {
    const matches: PiiMatch[] = []
    let result = text

    // Credit Card Detection
    // Matches 13-19 digit sequences with optional separators (spaces, dashes)
    // Common formats: 4111111111111111, 4111-1111-1111-1111, 4111 1111 1111 1111
    const creditCardRegex = /\b(\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{1,7}|\d{13,19})\b/g

    result = result.replace(creditCardRegex, (match) => {
        const digitsOnly = match.replace(/\D/g, '')

        // Must be 13-19 digits and pass Luhn check
        if (digitsOnly.length >= 13 && digitsOnly.length <= 19 && isValidLuhn(digitsOnly)) {
            const lastFour = digitsOnly.slice(-4)
            const masked = `[CARD ****${lastFour}]`
            matches.push({
                type: 'credit_card',
                original: match,
                masked,
                confidence: 'high'
            })
            return masked
        }
        return match
    })

    // SSN Detection
    // Formats: 123-45-6789, 123 45 6789, 123456789 (9 consecutive digits)
    // Excludes obvious non-SSNs (000, 666, 900-999 in first group)
    const ssnRegex = /\b(?!000|666|9\d{2})(\d{3})[-\s]?(?!00)(\d{2})[-\s]?(?!0000)(\d{4})\b/g

    result = result.replace(ssnRegex, (match, g1, g2, g3) => {
        // Additional validation: first group 001-899 (excluding 666)
        const firstGroup = parseInt(g1)
        if (firstGroup >= 1 && firstGroup <= 899 && firstGroup !== 666) {
            const lastFour = g3
            const masked = `[SSN ***-**-${lastFour}]`
            matches.push({
                type: 'ssn',
                original: match,
                masked,
                confidence: 'high'
            })
            return masked
        }
        return match
    })

    // Email Detection
    // Standard email pattern - high confidence
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g

    result = result.replace(emailRegex, (match) => {
        const [localPart, domain] = match.split('@')
        const maskedLocal = localPart.length > 2
            ? localPart[0] + '***' + localPart.slice(-1)
            : '***'
        const masked = `[EMAIL ${maskedLocal}@${domain}]`
        matches.push({
            type: 'email',
            original: match,
            masked,
            confidence: 'high'
        })
        return masked
    })

    // Phone Number Detection (US formats)
    // Matches: (123) 456-7890, 123-456-7890, 123.456.7890, 1234567890, +1 123 456 7890
    const phoneRegex = /(?:\+1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g

    result = result.replace(phoneRegex, (match) => {
        const digitsOnly = match.replace(/\D/g, '')
        // Must be 10-11 digits (with or without country code)
        if (digitsOnly.length >= 10 && digitsOnly.length <= 11) {
            const lastFour = digitsOnly.slice(-4)
            const masked = `[PHONE ***-***-${lastFour}]`
            matches.push({
                type: 'phone',
                original: match,
                masked,
                confidence: 'medium'
            })
            return masked
        }
        return match
    })

    return {
        text: result,
        matches,
        wasModified: matches.length > 0
    }
}

/**
 * Check if text contains potential PII without modifying it
 * Useful for logging/alerting
 */
export function containsPii(text: string): boolean {
    const result = anonymizePii(text)
    return result.wasModified
}

/**
 * Get a summary of PII types found in text
 */
export function getPiiSummary(text: string): Record<string, number> {
    const result = anonymizePii(text)
    const summary: Record<string, number> = {}

    for (const match of result.matches) {
        summary[match.type] = (summary[match.type] || 0) + 1
    }

    return summary
}
