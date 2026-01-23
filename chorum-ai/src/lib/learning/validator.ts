/**
 * Response Validator
 * Validates LLM responses against learned invariants and critical file rules.
 */

import type { LearningItem } from './types'

export interface ValidationResult {
    isValid: boolean
    violations: string[]
    warnings: string[]
    blastRadius: number
    touchedFiles: string[]
    touchedCriticalFiles: string[]
}

/**
 * Invariant check types - how to verify the rule
 * Stored in metadata.checkType
 */
export type InvariantCheckType = 'keyword' | 'regex' | 'contains' | 'not_contains'

/**
 * Extract file paths from LLM response text.
 * Handles multiple common formats:
 * - Bare paths: src/components/Button.tsx
 * - Backtick paths: `src/components/Button.tsx`
 * - Code fence headers: ```typescript src/foo.ts
 * - Markdown links: [Button](src/components/Button.tsx)
 */
function extractFilePaths(text: string): string[] {
    const paths = new Set<string>()

    // Common file extensions to look for
    const extensions = 'tsx?|jsx?|ts|js|py|go|rs|java|rb|php|css|scss|html|json|ya?ml|md|sql|sh'

    // Pattern 1: Paths in backticks `path/to/file.ext`
    const backtickRegex = new RegExp(`\`([\\w./\\-]+\\.(${extensions}))\``, 'gi')
    let match
    while ((match = backtickRegex.exec(text)) !== null) {
        paths.add(match[1])
    }

    // Pattern 2: Bare paths (word boundaries) - path/to/file.ext or ./path or ../path
    const barePathRegex = new RegExp(`(?:^|\\s|["'(])(\\.{0,2}/[\\w./\\-]+\\.(${extensions}))(?:\\s|$|["'):,])`, 'gim')
    while ((match = barePathRegex.exec(text)) !== null) {
        paths.add(match[1])
    }

    // Pattern 3: src/ style paths without leading dots
    const srcPathRegex = new RegExp(`(?:^|\\s|["'(\`])((src|lib|app|components|pages|api|utils|hooks|services)/[\\w./\\-]+\\.(${extensions}))`, 'gim')
    while ((match = srcPathRegex.exec(text)) !== null) {
        paths.add(match[1])
    }

    // Pattern 4: Code fence headers - ```lang path/to/file
    const fenceRegex = new RegExp(`\`\`\`\\w*\\s+([\\w./\\-]+\\.(${extensions}))`, 'gi')
    while ((match = fenceRegex.exec(text)) !== null) {
        paths.add(match[1])
    }

    // Pattern 5: Markdown links [text](path/to/file.ext)
    const linkRegex = new RegExp(`\\[.*?\\]\\(([\\w./\\-]+\\.(${extensions}))\\)`, 'gi')
    while ((match = linkRegex.exec(text)) !== null) {
        paths.add(match[1])
    }

    return Array.from(paths)
}

/**
 * Check if an invariant is violated by the response.
 */
function checkInvariant(response: string, invariant: LearningItem): boolean {
    const checkType: InvariantCheckType = invariant.metadata?.checkType || 'contains'
    const checkValue: string = invariant.metadata?.checkValue || invariant.content

    switch (checkType) {
        case 'keyword': {
            // Check for keyword (case-insensitive word boundary)
            const regex = new RegExp(`\\b${escapeRegex(checkValue)}\\b`, 'i')
            return regex.test(response)
        }

        case 'regex': {
            // Use provided regex pattern with ReDoS protection
            try {
                if (!isRegexSafe(checkValue)) {
                    console.warn(`[Validator] Potentially dangerous regex pattern rejected in invariant ${invariant.id}: ${checkValue.substring(0, 50)}...`)
                    return false
                }
                const regex = new RegExp(checkValue, 'i')
                return regex.test(response)
            } catch {
                console.warn(`[Validator] Invalid regex in invariant ${invariant.id}: ${checkValue}`)
                return false
            }
        }

        case 'contains': {
            // Simple substring check (case-insensitive)
            return response.toLowerCase().includes(checkValue.toLowerCase())
        }

        case 'not_contains': {
            // Inverse - should NOT contain this (violation if it does)
            return response.toLowerCase().includes(checkValue.toLowerCase())
        }

        default:
            return false
    }
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Maximum allowed regex pattern length (ReDoS prevention) */
const MAX_REGEX_LENGTH = 500

/**
 * Check if a regex pattern is potentially dangerous (ReDoS).
 * Detects common vulnerable patterns like nested quantifiers.
 */
function isRegexSafe(pattern: string): boolean {
    // Length check
    if (pattern.length > MAX_REGEX_LENGTH) return false

    // Detect nested quantifiers: (a+)+, (a*)+, (a+)*, (a*)*
    // These can cause catastrophic backtracking
    const nestedQuantifiers = /(\([^)]*[+*][^)]*\))[+*]/
    if (nestedQuantifiers.test(pattern)) return false

    // Detect overlapping alternations with quantifiers: (a|a)+
    const overlappingAlternation = /\([^)]*\|[^)]*\)[+*]/
    if (overlappingAlternation.test(pattern)) return false

    // Detect excessive quantifier nesting: a{1,100}{1,100}
    const excessiveNesting = /\{[^}]+\}\s*\{/
    if (excessiveNesting.test(pattern)) return false

    return true
}

/**
 * Validate an LLM response against invariants and critical file rules.
 */
export function validateResponse(
    responseContent: string,
    invariants: LearningItem[],
    criticalFiles: string[]
): ValidationResult {
    const result: ValidationResult = {
        isValid: true,
        violations: [],
        warnings: [],
        blastRadius: 0,
        touchedFiles: [],
        touchedCriticalFiles: []
    }

    // 1. Extract file paths from response
    const touchedFiles = extractFilePaths(responseContent)
    result.touchedFiles = touchedFiles
    result.blastRadius = touchedFiles.length

    // 2. Check invariants
    for (const invariant of invariants) {
        const isViolated = checkInvariant(responseContent, invariant)

        if (isViolated) {
            // For 'not_contains' type, violation means it DOES contain the forbidden thing
            // For other types, violation means the check matched (which is bad for invariants that say "don't do X")
            const isNegativeRule = invariant.metadata?.isNegativeRule !== false // default true for invariants

            if (isNegativeRule) {
                result.isValid = false
                result.violations.push(`Violated: ${invariant.content}`)
            }
        }
    }

    // 3. Check critical files
    for (const touchedFile of touchedFiles) {
        const normalizedTouched = touchedFile.replace(/\\/g, '/').toLowerCase()

        for (const criticalFile of criticalFiles) {
            const normalizedCritical = criticalFile.replace(/\\/g, '/').toLowerCase()

            // Match if paths end the same way (handles relative vs absolute)
            if (normalizedTouched.endsWith(normalizedCritical) ||
                normalizedCritical.endsWith(normalizedTouched) ||
                normalizedTouched === normalizedCritical) {
                result.touchedCriticalFiles.push(touchedFile)
                result.warnings.push(`Modifies critical file: ${touchedFile}`)
            }
        }
    }

    // 4. Blast radius warning
    if (result.blastRadius > 5) {
        result.warnings.push(`High blast radius: ${result.blastRadius} files referenced`)
    }

    if (result.blastRadius > 10) {
        result.warnings.push(`Very high blast radius - consider breaking into smaller changes`)
    }

    return result
}

/**
 * Create a user-friendly summary of validation results.
 */
export function formatValidationSummary(result: ValidationResult): string | null {
    if (result.isValid && result.warnings.length === 0) {
        return null
    }

    const parts: string[] = []

    if (!result.isValid) {
        parts.push(`⚠️ **Validation Issues:**`)
        for (const violation of result.violations) {
            parts.push(`  - ${violation}`)
        }
    }

    if (result.warnings.length > 0) {
        parts.push(`📋 **Warnings:**`)
        for (const warning of result.warnings) {
            parts.push(`  - ${warning}`)
        }
    }

    return parts.join('\n')
}
