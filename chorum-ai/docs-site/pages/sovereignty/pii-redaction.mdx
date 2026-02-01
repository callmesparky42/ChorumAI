---
title: PII Redaction
description: Automatic detection and masking of personal information.
---

# PII Redaction

Chorum can automatically detect and redact personally identifiable information (PII) before sending data to LLM providers.

## Why This Matters

When you paste code, logs, or data into a chat, you might accidentally include sensitive information—an email address, a phone number, a credit card from test data. PII redaction catches these before they leave your machine.

---

## What's Detected

Chorum detects and redacts four types of PII:

### Credit Card Numbers

**Detection:** 13-19 digit sequences with optional separators (spaces, dashes). Validated using the Luhn algorithm.

| Input | Redacted Output |
|-------|-----------------|
| `4111111111111111` | `[CARD ****1111]` |
| `4111-1111-1111-1111` | `[CARD ****1111]` |
| `4111 1111 1111 1111` | `[CARD ****1111]` |

**Note:** Only valid credit card numbers are redacted. Random 16-digit sequences that fail Luhn validation are left alone.

---

### Social Security Numbers (SSN)

**Detection:** 9-digit numbers in SSN format. Excludes invalid patterns (000, 666, 900-999 in first group).

| Input | Redacted Output |
|-------|-----------------|
| `123-45-6789` | `[SSN ***-**-6789]` |
| `123 45 6789` | `[SSN ***-**-6789]` |
| `123456789` | `[SSN ***-**-6789]` |

---

### Email Addresses

**Detection:** Standard email pattern recognition.

| Input | Redacted Output |
|-------|-----------------|
| `john.doe@company.com` | `[EMAIL j***e@company.com]` |
| `user@example.org` | `[EMAIL u***r@example.org]` |

**Note:** The domain is preserved for context. The local part is masked.

---

### Phone Numbers

**Detection:** US phone number formats (10-11 digits).

| Input | Redacted Output |
|-------|-----------------|
| `(555) 123-4567` | `[PHONE ***-***-4567]` |
| `555-123-4567` | `[PHONE ***-***-4567]` |
| `5551234567` | `[PHONE ***-***-4567]` |
| `+1 555 123 4567` | `[PHONE ***-***-4567]` |

---

## How It Works

### When Redaction Happens

PII redaction runs **before data leaves your browser**:

```
Your Message
     ↓
┌──────────────┐
│ PII Scanner  │  ← Runs client-side
└──────────────┘
     ↓
Redacted Message → LLM Provider
```

The LLM never sees the original PII. Your actual email address, phone number, or credit card stays on your machine.

### What the LLM Sees

Instead of:
```
Contact customer john.doe@acme.com at 555-123-4567
regarding charge to card 4111-1111-1111-1111
```

The LLM receives:
```
Contact customer [EMAIL j***e@acme.com] at [PHONE ***-***-4567]
regarding charge to card [CARD ****1111]
```

---

## Enabling/Disabling

### Via Settings

1. Go to **Settings → Security**
2. Find **Anonymize PII**
3. Toggle on or off

![Security Settings](/images/security-settings.png)

### When to Enable

| Situation | Recommendation |
|-----------|----------------|
| Working with customer data | **Enable** |
| Debugging with production logs | **Enable** |
| Personal projects with no PII | Optional |
| Working with synthetic/test data | Optional |

### When to Disable

- Working with intentionally fake data where detection is a false positive
- Need to discuss actual email domains or phone patterns with the AI
- Debugging the redaction system itself

---

## Example: Redaction in Action

**Before (your input):**
```
Debug this customer record:
{
  "name": "John Smith",
  "email": "john.smith@bigcompany.com",
  "phone": "(555) 867-5309",
  "ssn": "123-45-6789",
  "card": "4532 7890 1234 5678"
}
```

**After (sent to LLM):**
```
Debug this customer record:
{
  "name": "John Smith",
  "email": "[EMAIL j***h@bigcompany.com]",
  "phone": "[PHONE ***-***-5309]",
  "ssn": "[SSN ***-**-6789]",
  "card": "[CARD ****5678]"
}
```

![PII Redaction Example](/images/pii-redaction-example.png)

---

## Confidence Levels

Each detection has a confidence level:

| PII Type | Confidence | Notes |
|----------|------------|-------|
| Credit Card | High | Luhn validation ensures accuracy |
| SSN | High | Format + range validation |
| Email | High | Standard pattern matching |
| Phone | Medium | Some false positives possible |

Phone numbers are "medium" confidence because 10-digit sequences appear in other contexts (order numbers, IDs, etc.).

---

## Limitations

### What's NOT Detected

| Type | Why Not |
|------|---------|
| Names | Too context-dependent |
| Addresses | Too varied in format |
| Passwords | No reliable pattern |
| Custom identifiers | Project-specific |

### False Positives

Some valid data may be incorrectly flagged:
- 10-digit order numbers flagged as phones
- Test data with valid-format SSNs
- Example code with realistic-looking credit cards

If false positives are an issue, you can:
1. Disable PII redaction for that session
2. Accept that some legitimate numbers will be masked

### False Negatives

Some PII might slip through:
- International phone formats (non-US)
- Unusual email formats
- Credit cards from non-standard issuers

The system errs on the side of not false-positive flagging.

---

## Technical Implementation

The redaction happens in `src/lib/pii.ts`:

```typescript
// Core scanning function
export function anonymizePii(text: string): AnonymizeResult {
  const matches: PiiMatch[] = [];
  let result = text;
  
  // Credit card detection with Luhn validation
  result = result.replace(creditCardRegex, (match) => {
    if (isValidLuhn(match.replace(/\D/g, ''))) {
      const lastFour = match.slice(-4);
      return `[CARD ****${lastFour}]`;
    }
    return match;
  });
  
  // ... SSN, email, phone patterns
  
  return { text: result, matches, wasModified: matches.length > 0 };
}
```

---

## FAQ

### Does redaction affect memory storage?

No. Memory storage sees the original text. Redaction only applies when sending to external LLM providers.

### Can I see what was redacted?

Yes. When redaction occurs, the audit log (if enabled) records:
- That redaction happened
- Types of PII found (not the actual values)

### Does this work with local models?

PII redaction can be disabled for local models if you prefer. Since data never leaves your machine with local models, the privacy concern is different.

### Can I customize patterns?

Not currently. Future versions may allow custom PII patterns.

---

## Related Documentation

- **[Sovereignty Overview](./overview.md)** — Why privacy matters
- **[Security Settings](../settings/security.md)** — All security options
- **[Local-First](./local-first.md)** — Running without cloud exposure
