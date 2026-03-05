// src/lib/nebula/errors.ts
// Layer 0 error taxonomy. All Nebula errors extend NebulaError.
// Layer 1+ must catch NebulaError and not expose DB internals upward.

export type NebulaErrorCode =
  | 'NOT_FOUND'
  | 'CONSTRAINT_VIOLATION'
  | 'INVALID_INPUT'
  | 'DUPLICATE_SCOPE_TAG'          // '#general' attempted
  | 'CROSS_LENS_DENIED'            // allowCrossLens = false but query would cross scopes
  | 'TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_REVOKED'
  | 'EMBEDDING_DIM_MISMATCH'       // embedding passed doesn't match declared dims
  | 'INTERNAL'

export class NebulaError extends Error {
  constructor(
    public readonly code: NebulaErrorCode,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'NebulaError'
  }
}
