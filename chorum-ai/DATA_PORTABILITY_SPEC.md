# Data Portability & Encrypted Memory: Design Specification

> **Purpose:** Define how Chorum stores, encrypts, exports, and imports sovereign memory—making "portable" and "secure" the same thing.

---

## The Revelation

Nothing in any LLM provider's ToS requires:
- Memory to be human-readable
- Context injection to be plaintext  
- Markdown files to be stored in cleartext

**The insight:** Encrypt at rest, decrypt on demand, inject into prompt. The provider sees the content (unavoidable), but your filesystem, backups, and git repos see only ciphertext.

---

## Threat Model

| Threat | Before | After |
|--------|--------|-------|
| Someone with filesystem access | Reads everything | Sees encrypted blobs |
| Accidental git commit | Full plaintext exposure | Useless ciphertext |
| Cloud backup (iCloud/Dropbox) | Syncs readable files | Syncs encrypted noise |
| Provider sees your data | Yes (unavoidable) | Yes (minimum necessary) |
| Man-in-the-middle | HTTPS protects | HTTPS protects |
| RAM during request | Cleartext (unavoidable) | Cleartext (unavoidable) |

**Minimum attack surface:** Content exists in cleartext only in RAM, only for the duration of a request.

---

## Architecture Overview

```
.chorum/
├── vault.key              # Encrypted master key (PBKDF2 from passphrase)
├── memory/
│   ├── index.db           # SQLite: embeddings + metadata (not sensitive)
│   ├── patterns.enc       # AES-256-GCM encrypted content
│   ├── decisions.enc      # AES-256-GCM encrypted content
│   ├── invariants.enc     # AES-256-GCM encrypted content
│   └── facts.enc          # AES-256-GCM encrypted content
├── projects/
│   └── [project-id]/
│       ├── config.json    # Project settings (not sensitive)
│       └── memory.enc     # Project-specific encrypted memory
└── exports/
    └── [timestamp].chorum # Encrypted portable archive
```

---

## Encryption Design

### Key Hierarchy

```
User Passphrase
    ↓ PBKDF2 (100,000 iterations, SHA-256)
Derived Key (256-bit)
    ↓ 
Master Key (AES-256, stored in vault.key, encrypted with derived key)
    ↓
Per-File Keys (derived from master key + file path)
```

**Why the hierarchy:**
- Passphrase change doesn't require re-encrypting all content
- Just re-encrypt the master key with new derived key
- Per-file keys prevent cross-file cryptanalysis

### Encryption Scheme

```typescript
interface EncryptedBlob {
  version: 1;
  algorithm: 'AES-256-GCM';
  iv: string;        // Base64, 12 bytes, unique per encryption
  salt: string;      // Base64, for key derivation context
  ciphertext: string; // Base64
  tag: string;       // Base64, 16 bytes, authentication tag
}
```

**AES-256-GCM chosen for:**
- Authenticated encryption (integrity + confidentiality)
- Hardware acceleration on modern CPUs
- Well-understood, no exotic dependencies

### Key Derivation

```typescript
import { pbkdf2, randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ITERATIONS = 100_000;
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12;  // 96 bits for GCM
const TAG_LENGTH = 16; // 128 bits

function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    pbkdf2(passphrase, salt, ITERATIONS, KEY_LENGTH, 'sha256', (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

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
    salt: '', // Set at file level
    ciphertext: encrypted.toString('base64'),
    tag: cipher.getAuthTag().toString('base64')
  };
}

function decrypt(blob: EncryptedBlob, key: Buffer): string {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(blob.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
  
  return Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8');
}
```

---

## Index Design (Unencrypted, Non-Sensitive)

The relevance gating system needs to score memory items without decrypting everything. The index contains:

```sql
CREATE TABLE memory_index (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,           -- 'pattern' | 'decision' | 'invariant' | 'fact'
  domains TEXT,                 -- JSON array of domain tags
  embedding BLOB,               -- 384-dim float vector (not reconstructible)
  created_at INTEGER,
  updated_at INTEGER,
  usage_count INTEGER DEFAULT 0,
  token_estimate INTEGER,       -- For budget calculation
  file_ref TEXT,                -- Which .enc file contains this item
  item_offset INTEGER           -- Position within the encrypted file
);

CREATE INDEX idx_domains ON memory_index(domains);
CREATE INDEX idx_type ON memory_index(type);
CREATE INDEX idx_updated ON memory_index(updated_at DESC);
```

**Why embeddings aren't sensitive:**
- Embeddings are lossy projections into vector space
- You cannot reconstruct "Always use Zod for validation" from its 384-dim embedding
- An attacker with the index learns *nothing* about your actual patterns
- They can see you have 47 patterns and 12 decisions—that's metadata, not content

**What an attacker with index.db sees:**
```
id: a3f8c2...
type: pattern
domains: ["typescript", "validation"]
embedding: [0.023, -0.118, 0.042, ...]  // Meaningless without content
token_estimate: 45
```

They know you have a TypeScript validation pattern. They don't know what it says.

---

## Memory Operations

### Write Path (Learning)

```typescript
async function saveMemoryItem(item: MemoryItem, vault: Vault): Promise<void> {
  // 1. Generate embedding (for index)
  const embedding = await embed(item.content);
  
  // 2. Encrypt content
  const encrypted = encrypt(JSON.stringify(item), vault.getFileKey(item.type));
  
  // 3. Append to encrypted file
  const offset = await appendToEncryptedFile(`memory/${item.type}s.enc`, encrypted);
  
  // 4. Update index
  await db.run(`
    INSERT INTO memory_index (id, type, domains, embedding, created_at, token_estimate, file_ref, item_offset)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [item.id, item.type, JSON.stringify(item.domains), embedding, Date.now(), estimateTokens(item.content), `${item.type}s.enc`, offset]);
}
```

### Read Path (Injection)

```typescript
async function getRelevantMemory(
  query: QueryClassification,
  budget: number,
  vault: Vault
): Promise<MemoryItem[]> {
  // 1. Score against index (no decryption needed)
  const queryEmbedding = await embed(query.text);
  const scored = await scoreMemoryItems(queryEmbedding, query.domains, budget);
  
  // 2. Select within budget (index only)
  const selected = selectWithinBudget(scored, budget);
  
  // 3. Decrypt ONLY selected items
  const items: MemoryItem[] = [];
  for (const indexEntry of selected) {
    const encrypted = await readEncryptedItem(indexEntry.file_ref, indexEntry.item_offset);
    const decrypted = decrypt(encrypted, vault.getFileKey(indexEntry.type));
    items.push(JSON.parse(decrypted));
  }
  
  // 4. Content exists in RAM only, for this request
  return items;
}
```

**Key insight:** Decryption is lazy. Only the items that pass relevance scoring get decrypted. If your memory has 1,000 items and relevance gating selects 5, you decrypt 5.

---

## Vault Initialization

### First Run (New User)

```typescript
async function initializeVault(passphrase: string): Promise<Vault> {
  // Generate master key
  const masterKey = randomBytes(32);
  
  // Derive encryption key from passphrase
  const salt = randomBytes(16);
  const derivedKey = await deriveKey(passphrase, salt);
  
  // Encrypt master key with derived key
  const encryptedMaster = encrypt(masterKey.toString('base64'), derivedKey);
  
  // Write vault.key
  await writeFile('.chorum/vault.key', JSON.stringify({
    version: 1,
    salt: salt.toString('base64'),
    master: encryptedMaster
  }));
  
  return new Vault(masterKey);
}
```

### Unlock (Returning User)

```typescript
async function unlockVault(passphrase: string): Promise<Vault> {
  const vaultFile = JSON.parse(await readFile('.chorum/vault.key'));
  
  // Re-derive key from passphrase
  const derivedKey = await deriveKey(passphrase, Buffer.from(vaultFile.salt, 'base64'));
  
  // Decrypt master key
  const masterKey = Buffer.from(decrypt(vaultFile.master, derivedKey), 'base64');
  
  return new Vault(masterKey);
}
```

### Passphrase Change

```typescript
async function changePassphrase(vault: Vault, oldPass: string, newPass: string): Promise<void> {
  // Verify old passphrase
  await unlockVault(oldPass); // Throws if wrong
  
  // Generate new salt and derived key
  const newSalt = randomBytes(16);
  const newDerivedKey = await deriveKey(newPass, newSalt);
  
  // Re-encrypt master key (content unchanged!)
  const encryptedMaster = encrypt(vault.masterKey.toString('base64'), newDerivedKey);
  
  // Overwrite vault.key
  await writeFile('.chorum/vault.key', JSON.stringify({
    version: 1,
    salt: newSalt.toString('base64'),
    master: encryptedMaster
  }));
  
  // No need to re-encrypt any content files!
}
```

---

## Export Format

### Encrypted Export (Default)

```
filename: chorum-export-2026-01-23.chorum

Structure (ZIP archive):
├── manifest.json           # Version, export date, item counts
├── vault.key               # Master key, encrypted with export passphrase
├── memory/
│   ├── index.db            # Full index (embeddings + metadata)
│   ├── patterns.enc
│   ├── decisions.enc
│   ├── invariants.enc
│   └── facts.enc
└── projects/
    └── [project-id]/
        ├── config.json
        └── memory.enc
```

**Export passphrase:** Can be same as vault passphrase or different (for sharing).

```typescript
async function exportMemory(vault: Vault, exportPassphrase: string): Promise<Buffer> {
  const archive = new AdmZip();
  
  // Manifest
  archive.addFile('manifest.json', Buffer.from(JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    chorumVersion: '0.1.0',
    itemCounts: await getItemCounts()
  })));
  
  // Re-encrypt master key with export passphrase
  const exportSalt = randomBytes(16);
  const exportKey = await deriveKey(exportPassphrase, exportSalt);
  const exportVault = {
    version: 1,
    salt: exportSalt.toString('base64'),
    master: encrypt(vault.masterKey.toString('base64'), exportKey)
  };
  archive.addFile('vault.key', Buffer.from(JSON.stringify(exportVault)));
  
  // Copy encrypted files as-is (already encrypted with master key)
  for (const file of await glob('.chorum/memory/*.enc')) {
    archive.addLocalFile(file, 'memory/');
  }
  
  // Copy index
  archive.addLocalFile('.chorum/memory/index.db', 'memory/');
  
  // Projects
  for (const project of await glob('.chorum/projects/*/')) {
    archive.addLocalFolder(project, `projects/${basename(project)}/`);
  }
  
  return archive.toBuffer();
}
```

### Plaintext Export (Optional, Explicit)

For users who want human-readable export:

```typescript
async function exportPlaintext(vault: Vault): Promise<Buffer> {
  const archive = new AdmZip();
  
  // Manifest
  archive.addFile('manifest.json', Buffer.from(JSON.stringify({
    version: 1,
    format: 'plaintext',
    exportedAt: new Date().toISOString(),
    warning: 'THIS EXPORT IS NOT ENCRYPTED. Handle with care.'
  })));
  
  // Decrypt and export as markdown
  const patterns = await getAllDecrypted('pattern', vault);
  archive.addFile('memory/patterns.md', Buffer.from(formatAsMarkdown(patterns)));
  
  const decisions = await getAllDecrypted('decision', vault);
  archive.addFile('memory/decisions.md', Buffer.from(formatAsMarkdown(decisions)));
  
  // ... etc
  
  return archive.toBuffer();
}
```

**CLI flag:** `chorum export --plaintext` with confirmation prompt:

```
⚠️  WARNING: Plaintext export contains all your memory in readable form.
    Anyone with this file can read your patterns, decisions, and context.
    
    Are you sure? [y/N]
```

---

## Import Flow

```typescript
async function importMemory(archivePath: string, importPassphrase: string): Promise<void> {
  const archive = new AdmZip(archivePath);
  
  // Read and verify manifest
  const manifest = JSON.parse(archive.readAsText('manifest.json'));
  if (manifest.version !== 1) throw new Error('Unsupported export version');
  
  // Unlock export vault
  const exportVaultFile = JSON.parse(archive.readAsText('vault.key'));
  const exportKey = await deriveKey(importPassphrase, Buffer.from(exportVaultFile.salt, 'base64'));
  const importedMasterKey = Buffer.from(decrypt(exportVaultFile.master, exportKey), 'base64');
  
  // If we have an existing vault, re-encrypt imported content with our master key
  // If new install, use imported master key as our master key
  const vault = await getOrCreateVault();
  
  if (vault.isNew) {
    // First time setup - use imported key
    await initializeVaultWithKey(importedMasterKey, promptForPassphrase());
  } else {
    // Existing install - merge and re-encrypt
    await mergeImportedMemory(archive, importedMasterKey, vault);
  }
}
```

### Merge Strategy

When importing into existing Chorum:

```typescript
async function mergeImportedMemory(
  archive: AdmZip,
  importedKey: Buffer,
  localVault: Vault
): Promise<MergeReport> {
  const report = { added: 0, skipped: 0, conflicts: [] };
  
  // Read imported index
  const importedIndex = await loadIndexFromArchive(archive);
  const localIndex = await loadLocalIndex();
  
  for (const item of importedIndex) {
    const existing = localIndex.find(i => i.id === item.id);
    
    if (!existing) {
      // New item - decrypt with imported key, re-encrypt with local key
      const decrypted = await decryptFromArchive(archive, item, importedKey);
      await saveMemoryItem(decrypted, localVault);
      report.added++;
    } else if (existing.updated_at >= item.updated_at) {
      // Local is newer - skip
      report.skipped++;
    } else {
      // Imported is newer - conflict
      report.conflicts.push({
        id: item.id,
        local: existing,
        imported: item
      });
    }
  }
  
  return report;
}
```

**Conflict resolution UI:**
```
Conflict detected: Pattern "typescript-validation"
  Local (Jan 20):   "Use Zod for all runtime validation"
  Import (Jan 22):  "Use Zod for runtime validation, Yup for forms"
  
  [K]eep local  |  [U]se imported  |  [M]erge both  |  [S]kip
```

---

## Security Considerations

### What's Protected

| Asset | Protection | Notes |
|-------|------------|-------|
| Memory content | AES-256-GCM | Encrypted at rest |
| Master key | PBKDF2 + AES-256-GCM | Passphrase-protected |
| Embeddings | None (not sensitive) | Cannot reconstruct content |
| Metadata | None | Type, domain tags, timestamps visible |
| In-transit | HTTPS | Standard TLS |
| In-RAM | None (unavoidable) | Minimum exposure window |

### What's NOT Protected

- **The fact that you use Chorum** — directory structure visible
- **How much memory you have** — file sizes visible
- **When you last updated** — timestamps visible
- **Domain tags** — visible in index (you work with "typescript", "auth", etc.)

### Recommendations

1. **Use a strong passphrase** — 16+ characters, not reused
2. **Enable full-disk encryption** — Defense in depth
3. **Don't commit `.chorum/`** — Add to `.gitignore` by default
4. **Regular exports** — Backup to secure location

---

## CLI Commands

```bash
# Initialize vault (first run)
chorum init
> Enter passphrase: ********
> Confirm passphrase: ********
✓ Vault initialized

# Unlock for session
chorum unlock
> Enter passphrase: ********
✓ Vault unlocked (session: 4 hours)

# Export (encrypted)
chorum export
> Export passphrase (leave blank to use vault passphrase): ********
✓ Exported to chorum-export-2026-01-23.chorum

# Export (plaintext)
chorum export --plaintext
⚠️  WARNING: Plaintext export is not encrypted. Continue? [y/N] y
✓ Exported to chorum-export-2026-01-23-PLAINTEXT.zip

# Import
chorum import ./backup.chorum
> Import passphrase: ********
✓ Imported 47 patterns, 12 decisions, 8 invariants
  3 conflicts detected. Run `chorum conflicts` to resolve.

# Change passphrase
chorum passphrase
> Current passphrase: ********
> New passphrase: ********
> Confirm new passphrase: ********
✓ Passphrase updated (no re-encryption needed)
```

---

## Implementation Phases

### Phase 1: Core Encryption (Week 1)
- Vault initialization and unlock
- AES-256-GCM encrypt/decrypt utilities
- Key derivation from passphrase
- Migrate existing plaintext to encrypted format

### Phase 2: Index + Lazy Decryption (Week 2)
- SQLite index with embeddings
- Lazy decryption in relevance gating
- Integration with memory injection pipeline

### Phase 3: Export/Import (Week 3)
- Encrypted export format
- Plaintext export (with warnings)
- Import with merge and conflict resolution

### Phase 4: CLI (Week 4)
- `chorum init/unlock/lock`
- `chorum export/import`
- `chorum passphrase`
- Session management

---

## Marketing Update

**Old:** "Memory stored as readable files you control"

**New:** 

> "Memory encrypted at rest. Decrypted only when needed. Readable on your terms."

> "Your sovereign context—encrypted by default, portable by design."

> "The only plaintext is in RAM, only for the request, only when you need it."

---

## Summary

Encrypted memory solves the tension between "portable" and "secure":

- **Portable:** Export your entire context as a single `.chorum` file
- **Secure:** AES-256-GCM encryption, passphrase-protected
- **Efficient:** Index enables relevance scoring without decryption
- **Lazy:** Only decrypt what you need, when you need it
- **Compatible:** Plaintext export available for those who want it

The providers see your content (unavoidable—they have to process it). But your filesystem, your backups, and your accidental git commits see only encrypted noise.

**True sovereignty = you control the keys.**

---

*"Nothing says markdown must be in full text."*
