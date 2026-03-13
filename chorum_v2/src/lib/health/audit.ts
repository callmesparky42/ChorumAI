import { createClient } from '@supabase/supabase-js'

export type PhiAction = 'view' | 'create' | 'export' | 'decrypt' | 'delete' | 'integrity_failure'
export type PhiResourceType = 'snapshot' | 'trend' | 'report' | 'export'

export interface AuditLogEntry {
  userId: string
  actorId: string
  action: PhiAction
  resourceType: PhiResourceType
  resourceId?: string
  ipAddress?: string
}

const healthSupabaseUrl = process.env.HEALTH_SUPABASE_URL
const healthSupabaseServiceKey = process.env.HEALTH_SUPABASE_SERVICE_KEY

const healthSupabase = healthSupabaseUrl && healthSupabaseServiceKey
  ? createClient(healthSupabaseUrl, healthSupabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null

async function insertAuditEntry(entry: AuditLogEntry): Promise<void> {
  if (!healthSupabase) {
    throw new Error('Health Supabase service client is not configured.')
  }

  const { error } = await healthSupabase.from('phi_audit_log').insert({
    user_id: entry.userId,
    actor_id: entry.actorId,
    action: entry.action,
    resource_type: entry.resourceType,
    resource_id: entry.resourceId ?? null,
    ip_address: entry.ipAddress ?? null,
  })

  if (error) {
    throw error
  }
}

export async function logPhiAccess(entry: AuditLogEntry): Promise<void> {
  void insertAuditEntry(entry).catch((err: unknown) => {
    console.error('[phi_audit] Failed to write audit log:', err)
  })
}
