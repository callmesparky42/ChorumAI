import { and, eq, isNull, or } from 'drizzle-orm'
import { db } from '@/db'
import { personas } from '@/db/schema'
import type { ScopeFilter } from '@/lib/nebula/types'
import type { AgentDefinition, CreatePersonaInput, PersonaTier } from './types'

function toAgentDefinition(row: typeof personas.$inferSelect): AgentDefinition {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    scopeFilter: row.scopeFilter as ScopeFilter,
    systemPromptTemplate: row.systemPrompt,
    defaultProvider: row.defaultProvider,
    defaultModel: row.defaultModel,
    temperature: row.temperature,
    maxTokens: row.maxTokens,
    allowedTools: (row.allowedTools as string[]) ?? [],
    isSystem: row.isSystem,
    tier: (row.tier as PersonaTier | null) ?? null,
  }
}

export async function getPersonas(userId: string): Promise<AgentDefinition[]> {
  const rows = await db
    .select()
    .from(personas)
    .where(
      and(
        or(isNull(personas.userId), eq(personas.userId, userId)),
        eq(personas.isActive, true),
      ),
    )

  return rows.map(toAgentDefinition)
}

export async function getPersona(id: string): Promise<AgentDefinition | null> {
  const [row] = await db.select().from(personas).where(eq(personas.id, id))
  return row ? toAgentDefinition(row) : null
}

export async function createPersona(
  userId: string,
  input: CreatePersonaInput,
): Promise<AgentDefinition> {
  const [row] = await db
    .insert(personas)
    .values({
      userId,
      name: input.name,
      description: input.description,
      systemPrompt: input.systemPrompt,
      defaultProvider: input.defaultProvider,
      defaultModel: input.defaultModel,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      scopeFilter: input.scopeFilter,
      allowedTools: input.allowedTools,
      isSystem: false,
      isActive: true,
    })
    .returning()

  if (!row) {
    throw new Error('Failed to create persona')
  }

  return toAgentDefinition(row)
}

export async function deletePersona(id: string, userId: string): Promise<boolean> {
  const persona = await getPersona(id)
  if (!persona || persona.isSystem) return false

  await db
    .delete(personas)
    .where(and(eq(personas.id, id), eq(personas.userId, userId)))

  return true
}
