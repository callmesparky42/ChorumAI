// src/lib/health/integrity.ts
// Re-derives payload hash from decrypted PHI and compares against stored hash.

import { decryptPHI, hashPHI } from '@/lib/health/crypto'
import { logPhiAccess } from '@/lib/health/audit'

export interface IntegrityResult {
  snapshotId: string
  passed: boolean
  reason?: string
}

export function verifySnapshot(snapshot: {
  id: string
  encryptedPayload: string
  payloadIv: string
  payloadHash: string
}): IntegrityResult {
  try {
    const decrypted = decryptPHI(snapshot.encryptedPayload, snapshot.payloadIv)
    const recomputed = hashPHI(decrypted)

    if (recomputed !== snapshot.payloadHash) {
      return {
        snapshotId: snapshot.id,
        passed: false,
        reason: 'Hash mismatch - payload may be corrupted or tampered',
      }
    }
    return { snapshotId: snapshot.id, passed: true }
  } catch (err) {
    return {
      snapshotId: snapshot.id,
      passed: false,
      reason: err instanceof Error ? `Decryption failed: ${err.message}` : 'Decryption failed',
    }
  }
}

export async function verifyBatch(
  snapshots: Parameters<typeof verifySnapshot>[0][],
  userId: string,
): Promise<{ total: number; passed: number; failed: number; failures: IntegrityResult[] }> {
  const failures: IntegrityResult[] = []

  for (const snapshot of snapshots) {
    const result = verifySnapshot(snapshot)
    if (!result.passed) {
      failures.push(result)
      await logPhiAccess({
        userId,
        actorId: 'system',
        action: 'integrity_failure',
        resourceType: 'snapshot',
        resourceId: snapshot.id,
      }).catch(() => {
        // Never block integrity processing on audit insert failures.
      })
    }
  }

  return {
    total: snapshots.length,
    passed: snapshots.length - failures.length,
    failed: failures.length,
    failures,
  }
}
