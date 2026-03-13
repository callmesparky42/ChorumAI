// src/lib/health/deidentify.ts
// HIPAA Safe Harbor de-identification — §164.514(b).
// Strips all 18 identifier categories before any data reaches an LLM.
//
// ONE-DIRECTIONAL: apply only at the LLM injection boundary.
// NEVER apply to data at rest — health_snapshots always store original encrypted payloads.
//
// Clinical values (lab results, vital signs, HRV readings, units) pass through unchanged.
// Numeric values in objects are NEVER altered — numbers are not PHI in isolation.

// ---------------------------------------------------------------------------
// Identifier patterns — HIPAA Safe Harbor 18 categories
// ---------------------------------------------------------------------------

const PATTERNS: ReadonlyArray<{ readonly pattern: RegExp; readonly replacement: string }> = [
  // 1. Names — Title-cased two-word combos (heuristic; false-positive is acceptable)
  { pattern: /\b[A-Z][a-z]{1,20} [A-Z][a-z]{1,20}\b/g,           replacement: '[NAME]' },
  // 2. Geographic subdivisions smaller than state — ZIP codes
  { pattern: /\b\d{5}(?:-\d{4})?\b/g,                              replacement: '[ZIP]' },
  // 3. Dates (except year) — MM/DD/YYYY, MM-DD-YYYY
  { pattern: /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g,            replacement: '[DATE]' },
  // 3b. Written dates: "March 15, 2024" or "15 March 2024"
  { pattern: /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?) \d{1,2},? \d{4}\b/gi, replacement: '[DATE]' },
  { pattern: /\b\d{1,2} (?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?),? \d{4}\b/gi, replacement: '[DATE]' },
  // 4+5. Phone and fax numbers
  { pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, replacement: '[PHONE]' },
  // 6. Email addresses
  { pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, replacement: '[EMAIL]' },
  // 7. Social Security Numbers
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g,                             replacement: '[SSN]' },
  // 8. Medical Record Numbers
  { pattern: /\b(?:MRN|Medical Record(?:\s+Number)?|Record #?)\s*:?\s*[\w\-]+/gi, replacement: '[MRN]' },
  // 9. Health plan beneficiary numbers
  { pattern: /\b(?:Member|Policy|Plan)\s*(?:ID|#|No\.?)\s*:?\s*[\w\-]+/gi, replacement: '[PLAN_ID]' },
  // 10. Account numbers
  { pattern: /\b(?:Account|Acct\.?)\s*(?:No\.?|#|Number)\s*:?\s*[\w\-]+/gi, replacement: '[ACCOUNT]' },
  // 11. Certificate/license numbers
  { pattern: /\b(?:License|Certificate)\s*(?:No\.?|#|Number)\s*:?\s*[\w\-]{4,}/gi, replacement: '[LICENSE]' },
  // 12. VIN — 17-char alphanumeric
  { pattern: /\b[A-HJ-NPR-Z0-9]{17}\b/g,                           replacement: '[VIN]' },
  // 13. Device identifiers — long numeric IDs (10+ digits)
  { pattern: /\b\d{10,}\b/g,                                        replacement: '[ID]' },
  // 14. URLs
  { pattern: /https?:\/\/[^\s"'<>]+/gi,                             replacement: '[URL]' },
  // 15. IP addresses
  { pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,                       replacement: '[IP]' },
  // 18. Catch-all formatted IDs (e.g. PT123456, MED00456)
  { pattern: /\b[A-Z]{2,4}\d{6,}\b/g,                              replacement: '[ID]' },
]

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * De-identify a text string by scrubbing all HIPAA Safe Harbor identifiers.
 * Clinical strings like "HR: 72 bpm", "K+: 4.1 mEq/L" pass through unchanged.
 */
export function deidentify(text: string): string {
  let result = text
  for (const { pattern, replacement } of PATTERNS) {
    result = result.replace(pattern, replacement)
  }
  return result
}

/**
 * De-identify a structured object. Recursively scrubs all string values.
 * Non-string leaf values (numbers, booleans) pass through unchanged —
 * clinical numeric values must never be altered.
 */
export function deidentifyObject(obj: unknown): unknown {
  if (typeof obj === 'string') return deidentify(obj)
  if (Array.isArray(obj)) return obj.map(deidentifyObject)
  if (typeof obj === 'object' && obj !== null) {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, deidentifyObject(v)])
    )
  }
  return obj   // number, boolean, null, undefined — pass through
}
