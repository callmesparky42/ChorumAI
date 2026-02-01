---
title: Encryption
description: How Chorum encrypts your memory at rest.
---

# Encryption

Chorum encrypts your patterns, decisions, and invariants at rest using AES-256-GCM. Only you can decrypt them with your passphrase.

## Why This Matters

If someone gets access to your filesystem—through theft, backup exposure, or accidental git commit—they see only encrypted blobs. Your actual knowledge is unreadable without your passphrase.

---

## Encryption Scheme

All sensitive data is encrypted using:

- **Algorithm**: AES-256-GCM
- **Key Derivation**: PBKDF2 with SHA-256
- **Iterations**: 100,000
- **Authentication**: GCM provides both encryption and integrity

AES-256-GCM is:
- **Authenticated** — Detects tampering
- **Hardware-accelerated** — Fast on modern CPUs
- **Well-understood** — No exotic dependencies

---

## Key Hierarchy

```
User Passphrase
     ↓ PBKDF2 (100,000 iterations)
Derived Key (256-bit)
     ↓ 
Master Key (stored encrypted with derived key)
     ↓
Per-File Keys (derived from master key + file path)
```

### Why the Hierarchy?

- **Passphrase change is fast** — Just re-encrypt the master key, not all content
- **Per-file keys** — Prevents cross-file cryptanalysis
- **Master key never exposed** — Stored encrypted, only in RAM when needed

---

## What's Encrypted vs. Not

### Encrypted (Sensitive)

| Data | Storage Format |
|------|----------------|
| Pattern content | `.enc` files |
| Decision content | `.enc` files |
| Invariant content | `.enc` files |
| Fact content | `.enc` files |
| Project-specific memory | `memory.enc` |

### Unencrypted (Non-Sensitive)

| Data | Why It's Safe |
|------|---------------|
| Embeddings | Lossy—can't reconstruct content |
| Metadata (type, domain tags) | Doesn't reveal content |
| Timestamps | Low sensitivity |
| Index structure | Just pointers |

### Why Embeddings Aren't Sensitive

Embeddings are 384-dimensional vectors that capture semantic meaning. They're **one-way transformations**:

- You cannot reconstruct "Always use Zod for validation" from its embedding
- An attacker with embeddings learns nothing about your actual patterns
- They might see you have 47 patterns—that's metadata, not content

---

## Encrypted Blob Format

Each encrypted piece of data looks like:

```typescript
{
  version: 1,
  algorithm: 'AES-256-GCM',
  iv: string,        // Base64, 12 bytes, unique per encryption
  salt: string,      // Base64, for key derivation context
  ciphertext: string, // Base64
  tag: string        // Base64, 16 bytes, authentication tag
}
```

The `iv` (initialization vector) is randomly generated for each encryption, so identical content produces different ciphertext.

---

## Storage Structure

```
.chorum/
├── vault.key              # Master key (encrypted with passphrase)
├── memory/
│   ├── index.db           # SQLite: embeddings + metadata (not sensitive)
│   ├── patterns.enc       # AES-256-GCM encrypted content
│   ├── decisions.enc      # AES-256-GCM encrypted content
│   ├── invariants.enc     # AES-256-GCM encrypted content
│   └── facts.enc          # AES-256-GCM encrypted content
└── projects/
    └── [project-id]/
        ├── config.json    # Project settings (not sensitive)
        └── memory.enc     # Project-specific encrypted memory
```

---

## Lazy Decryption

Chorum only decrypts what it needs for each request:

1. Your query is classified and scored against the **index** (no decryption)
2. Top-scoring memories are identified
3. **Only those items** are decrypted from the `.enc` files
4. Content exists in RAM briefly, then is discarded

If you have 1,000 learnings and relevance gating selects 5, only 5 are decrypted.

---

## Changing Your Passphrase

When you change your passphrase:

1. Old passphrase is verified
2. New derived key is generated from new passphrase
3. Master key is re-encrypted with new derived key
4. **No content re-encryption needed**

The master key stays the same—only its encryption wrapper changes. This makes passphrase changes fast.

---

## What This Protects Against

| Scenario | Outcome |
|----------|---------|
| Laptop stolen | Thief sees encrypted blobs |
| Backup to cloud drive | Syncs encrypted data |
| Accidental git commit of `.chorum/` | Useless without passphrase |
| Filesystem access by other apps | Can't read content |

## What This Doesn't Protect

| Scenario | Reality |
|----------|---------|
| Passphrase compromised | Attacker can decrypt everything |
| RAM inspection during use | Content is cleartext temporarily |
| LLM provider | Sees your prompts (unavoidable for cloud) |

---

## Best Practices

| Practice | Why |
|----------|-----|
| Use a strong passphrase | 16+ characters, not reused |
| Enable full-disk encryption | Defense in depth |
| Add `.chorum/` to `.gitignore` | Prevent accidental commits |
| Regular backups | Encrypted exports to secure location |

---

## Technical Details

### Key Derivation

```typescript
const ITERATIONS = 100_000;
const KEY_LENGTH = 32; // 256 bits

function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    pbkdf2(passphrase, salt, ITERATIONS, KEY_LENGTH, 'sha256', (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}
```

### Encryption/Decryption

```typescript
const IV_LENGTH = 12;  // 96 bits for GCM

function encrypt(plaintext: string, key: Buffer): EncryptedBlob {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  
  return {
    version: 1,
    algorithm: 'AES-256-GCM',
    iv: iv.toString('base64'),
    ciphertext: encrypted.toString('base64'),
    tag: cipher.getAuthTag().toString('base64')
  };
}
```

---

## Related Documentation

- **[Sovereignty Overview](./overview.md)** — Why sovereignty matters
- **[Export/Import](./export-import.md)** — Encrypted backups
- **[Local-First](./local-first.md)** — Running without cloud
