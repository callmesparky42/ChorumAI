'use client'

import { useState, useEffect } from 'react'
import { HyggeTabs, HyggeCard, HyggeInput, HyggeToggle, HyggeButton, HyggeToast } from '@/components/hygge'
import {
    getUserProviders, saveProviderConfig, deleteProviderConfig, testProviderConnection,
    getUserCustomization, updateUserCustomization, listSeeds, createSeed, deleteSeed,
    exportAllData,
    getTaskProviderConfig, setTaskProviderConfig, getTaskUsageStats,
} from '@/lib/shell/actions'

type TaskName = 'judge' | 'embedding' | 'extraction' | 'chat'

const TASK_LABELS: Record<TaskName, { label: string; description: string; defaultMaxTokens: number; hasTokenLimit: boolean }> = {
    judge: { label: 'End-of-session Judge', description: 'Reviews injected knowledge after each conversation and proposes confidence adjustments.', defaultMaxTokens: 1024, hasTokenLimit: true },
    embedding: { label: 'Embedding', description: 'Generates vector embeddings for semantic search. Currently only OpenAI embedding models are supported.', defaultMaxTokens: 512, hasTokenLimit: false },
    extraction: { label: 'Extraction', description: 'Extracts learnings from conversation history at end of session.', defaultMaxTokens: 2048, hasTokenLimit: true },
    chat: { label: 'Chat (override)', description: 'Override the agent router for chat. Leave empty to use automatic routing.', defaultMaxTokens: 4096, hasTokenLimit: true },
}

function TaskAssignmentsSection({ userId, providers }: { userId: string; providers: any[] }) {
    const TASKS: TaskName[] = ['judge', 'embedding', 'extraction', 'chat']
    const [taskConfig, setTaskConfig] = useState<Record<string, any>>({})
    const [usage, setUsage] = useState<Record<string, any>>({})
    const [editingTask, setEditingTask] = useState<TaskName | null>(null)
    const [editValues, setEditValues] = useState({ provider: '', model: '', maxTokens: '', dailyTokenLimit: '' })

    useEffect(() => {
        getTaskProviderConfig(userId).then(setTaskConfig).catch(console.error)
        getTaskUsageStats(userId).then(setUsage).catch(console.error)
    }, [userId])

    const handleEdit = (task: TaskName) => {
        const cfg = taskConfig[task]
        setEditValues({
            provider: cfg?.provider ?? '',
            model: cfg?.model ?? '',
            maxTokens: cfg?.maxTokens?.toString() ?? TASK_LABELS[task].defaultMaxTokens.toString(),
            dailyTokenLimit: cfg?.dailyTokenLimit?.toString() ?? '',
        })
        setEditingTask(task)
    }

    const handleSave = async (task: TaskName) => {
        if (!editValues.provider) {
            await setTaskProviderConfig(userId, task, null)
            const updated = await getTaskProviderConfig(userId)
            setTaskConfig(updated)
        } else {
            const cfg: { provider: string; model?: string; maxTokens?: number; dailyTokenLimit?: number } = {
                provider: editValues.provider,
            }
            if (editValues.model) cfg.model = editValues.model
            if (editValues.maxTokens) cfg.maxTokens = parseInt(editValues.maxTokens)
            if (editValues.dailyTokenLimit) cfg.dailyTokenLimit = parseInt(editValues.dailyTokenLimit)
            await setTaskProviderConfig(userId, task, cfg)
            const updated = await getTaskProviderConfig(userId)
            setTaskConfig(updated)
        }
        setEditingTask(null)
    }

    return (
        <div className="pt-6 border-t border-[var(--hg-border)]">
            <h3 className="text-sm font-medium mb-1">Task Assignments</h3>
            <p className="text-xs text-[var(--hg-text-tertiary)] mb-4">Route specific tasks to specific providers. Overrides the priority-based auto-selection.</p>
            <div className="space-y-3">
                {TASKS.map(task => {
                    const cfg = taskConfig[task]
                    const meta = TASK_LABELS[task]
                    const taskUsage = usage[task]
                    const isEditing = editingTask === task
                    const providerNames = providers.map(p => p.provider)

                    return (
                        <HyggeCard key={task}>
                            <div className="flex justify-between items-start">
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm">{meta.label}</div>
                                    <div className="text-xs text-[var(--hg-text-tertiary)] mt-0.5">{meta.description}</div>
                                    {cfg ? (
                                        <div className="text-xs text-[var(--hg-text-secondary)] mt-1 font-mono">
                                            {cfg.provider}{cfg.model ? ` · ${cfg.model}` : ''}{cfg.maxTokens ? ` · ${cfg.maxTokens} max tokens` : ''}
                                            {cfg.dailyTokenLimit ? ` · limit: ${cfg.dailyTokenLimit}/day` : ''}
                                        </div>
                                    ) : (
                                        <div className="text-xs text-[var(--hg-text-tertiary)] mt-1">auto (first enabled provider)</div>
                                    )}
                                    {taskUsage && taskUsage.tokensUsed > 0 && (
                                        <div className="text-[10px] text-[var(--hg-text-tertiary)] mt-1">
                                            today: {taskUsage.tokensUsed.toLocaleString()} tokens used
                                        </div>
                                    )}
                                </div>
                                <button
                                    className="text-xs text-[var(--hg-text-secondary)] hover:text-[var(--hg-text-primary)] ml-4 shrink-0"
                                    onClick={() => isEditing ? setEditingTask(null) : handleEdit(task)}
                                >
                                    {isEditing ? 'cancel' : 'configure'}
                                </button>
                            </div>

                            {isEditing && (
                                <div className="mt-4 pt-4 border-t border-[var(--hg-border-subtle)] space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] uppercase text-[var(--hg-text-tertiary)] block mb-1">Provider</label>
                                            <select
                                                className="w-full text-sm bg-[var(--hg-bg)] border border-[var(--hg-border)] rounded px-2 py-1.5 text-[var(--hg-text-primary)]"
                                                value={editValues.provider}
                                                onChange={e => setEditValues(v => ({ ...v, provider: e.target.value }))}
                                            >
                                                <option value="">— auto —</option>
                                                {providerNames.map(p => <option key={p} value={p}>{p}</option>)}
                                            </select>
                                        </div>
                                        <HyggeInput
                                            label="Model (optional)"
                                            value={editValues.model}
                                            onChange={e => setEditValues(v => ({ ...v, model: e.target.value }))}
                                            placeholder={`e.g. gpt-4o-mini`}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <HyggeInput
                                            label="Max completion tokens"
                                            value={editValues.maxTokens}
                                            onChange={e => setEditValues(v => ({ ...v, maxTokens: e.target.value }))}
                                            placeholder={String(meta.defaultMaxTokens)}
                                        />
                                        {meta.hasTokenLimit && (
                                            <HyggeInput
                                                label="Daily token limit (0 = none)"
                                                value={editValues.dailyTokenLimit}
                                                onChange={e => setEditValues(v => ({ ...v, dailyTokenLimit: e.target.value }))}
                                                placeholder="e.g. 50000"
                                            />
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <HyggeButton variant="accent" onClick={() => handleSave(task)}>save</HyggeButton>
                                        {cfg && (
                                            <button
                                                className="text-xs text-[var(--hg-destructive)] hover:underline"
                                                onClick={async () => {
                                                    await setTaskProviderConfig(userId, task, null)
                                                    setTaskConfig(await getTaskProviderConfig(userId))
                                                    setEditingTask(null)
                                                }}
                                            >clear assignment</button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </HyggeCard>
                    )
                })}
            </div>
        </div>
    )
}

function ProvidersTab({ userId }: { userId: string }) {
    const [providers, setProviders] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [newProv, setNewProv] = useState('')
    const [newKey, setNewKey] = useState('')
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState<string | null>(null)
    const [healthStatus, setHealthStatus] = useState<Record<string, { ok: boolean; latency?: number; err?: string }>>({})

    useEffect(() => {
        getUserProviders(userId).then(p => { setProviders(p); setLoading(false) }).catch(e => { console.error(e); setLoading(false) })
    }, [userId])

    const handleSave = async () => {
        if (!newProv || !newKey) return
        setSaving(true)
        try {
            await saveProviderConfig(userId, { provider: newProv, apiKey: newKey, modelOverride: null, baseUrl: null, isLocal: false, priority: providers.length })
            const p = await getUserProviders(userId)
            setProviders(p)
            setNewProv('')
            setNewKey('')
        } catch (e: any) {
            console.error(e)
            setToast(`Failed to save provider: ${e?.message ?? 'Unknown error'}`)
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (prov: string) => {
        try {
            await deleteProviderConfig(userId, prov)
            setProviders(await getUserProviders(userId))
        } catch (e: any) {
            console.error(e)
            setToast(`Failed to remove provider: ${e?.message ?? 'Unknown error'}`)
        }
    }

    const handleTest = async (prov: string) => {
        setHealthStatus(prev => ({ ...prev, [prov]: { ok: false, err: 'Testing...' } }))
        const res = await testProviderConnection(prov)
        setHealthStatus(prev => {
            const next = { ...prev }
            next[prov] = { ok: res.success }
            if (res.latencyMs !== undefined) next[prov].latency = res.latencyMs
            if (res.error !== undefined) next[prov].err = res.error
            return next
        })
    }

    if (loading) return <div>Loading providers...</div>

    return (
        <div className="space-y-6 max-w-2xl">
            {toast && <HyggeToast message={toast} />}
            <div>
                <h3 className="text-sm font-medium mb-4">API Keys</h3>
                {providers.length === 0 && <p className="text-sm text-[var(--hg-text-tertiary)]">No providers configured.</p>}
                {providers.map(p => {
                    const status = healthStatus[p.provider]
                    return (
                        <HyggeCard key={p.provider} className="mb-4">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <div className="font-medium text-sm">{p.provider}</div>
                                    <div className="text-xs text-[var(--hg-text-tertiary)] mt-1">Priority: {p.priority} · Model Override: {p.modelOverride || 'None'}</div>
                                    {status && (
                                        <div className="text-xs mt-2">
                                            Last tested: {status.ok ? <span className="text-[var(--hg-success)]">✓ OK ({status.latency}ms)</span> : <span className="text-[var(--hg-destructive)]">✗ {status.err}</span>}
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <button className="text-xs text-[var(--hg-text-secondary)] hover:text-[var(--hg-text-primary)]" onClick={() => handleTest(p.provider)}>test</button>
                                    <button className="text-xs text-[var(--hg-destructive)] hover:underline" onClick={() => handleDelete(p.provider)}>remove</button>
                                </div>
                            </div>
                        </HyggeCard>
                    )
                })}
            </div>

            <div className="pt-6 border-t border-[var(--hg-border)]">
                <h3 className="text-sm font-medium mb-4">Add Provider</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <HyggeInput label="Provider ID (e.g., openai, anthropic)" value={newProv} onChange={e => setNewProv(e.target.value)} />
                    <HyggeInput label="API Key" type="password" value={newKey} onChange={e => setNewKey(e.target.value)} />
                </div>
                <HyggeButton onClick={handleSave} disabled={!newProv || !newKey || saving} variant="accent">{saving ? 'Saving…' : 'Save Provider'}</HyggeButton>
            </div>

            <TaskAssignmentsSection userId={userId} providers={providers} />
        </div>
    )
}

// Personas are managed exclusively in the Agent Drawer (right panel of Chat page)


const MEMORY_DEFAULTS = {
    autoExtract: true,
    autoInject: true,
    allowConductorActions: false,
}

function MemoryTab({ userId }: { userId: string }) {
    const [cust, setCust] = useState<typeof MEMORY_DEFAULTS | null>(null)

    useEffect(() => {
        getUserCustomization(userId).then(raw => {
            // Merge with defaults so toggles show correct state even for new users
            setCust({ ...MEMORY_DEFAULTS, ...raw })
        }).catch(e => { console.error(e); setCust(MEMORY_DEFAULTS) })
    }, [userId])

    if (!cust) return <div className="p-4 text-[var(--hg-text-tertiary)]">Loading...</div>

    const toggle = async (key: string, val: boolean) => {
        const next = { ...cust, [key]: val }
        setCust(next)
        await updateUserCustomization(userId, next)
    }

    return (
        <div className="space-y-2 max-w-2xl">
            <HyggeToggle
                label="End-of-Session Judge"
                description="After each conversation, an LLM reviews what was injected and proposes confidence adjustments. Requires a Judge provider to be assigned in the Providers tab."
                checked={!!(cust as any).judgeEnabled}
                onChange={v => toggle('judgeEnabled', v)}
            />
            <HyggeToggle
                label="Auto-extract Learnings"
                description="The Conductor will automatically extract patterns and rules from your conversations."
                checked={cust.autoExtract}
                onChange={v => toggle('autoExtract', v)}
            />
            <HyggeToggle
                label="Auto-inject Context"
                description="Agents will automatically search the Nebula graph for relevant context before replying."
                checked={cust.autoInject}
                onChange={v => toggle('autoInject', v)}
            />
            <HyggeToggle
                label="Allow Conductor Actions"
                description="The Conductor agent may independently search for information to enrich learning proposals."
                checked={cust.allowConductorActions}
                onChange={v => toggle('allowConductorActions', v)}
            />
        </div>
    )
}

function AccountTab() {
    const [toast, setToast] = useState<string | null>(null)
    const [tokens, setTokens] = useState<any[]>([])
    const [loadingTokens, setLoadingTokens] = useState(true)
    const [newTokenName, setNewTokenName] = useState('')
    const [revealedToken, setRevealedToken] = useState<{ id: string; token: string } | null>(null)

    useEffect(() => {
        import('@/lib/shell/actions').then(m => m.listTokens().then(t => {
            setTokens(t)
            setLoadingTokens(false)
        }).catch(() => setLoadingTokens(false)))
    }, [])

    const handleExport = async () => {
        const data = await exportAllData()
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `chorum-export-${new Date().toISOString().split('T')[0]!}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        setToast('Data exported successfully')
    }

    const handleImport = () => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json'
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0]
            if (!file) return
            try {
                const text = await file.text()
                const data = JSON.parse(text)
                const { importAllData } = await import('@/lib/shell/actions')
                await importAllData(data)
                setToast('Data imported successfully. Refresh to see changes.')
            } catch (err: any) {
                console.error(err)
                setToast(`Failed to import data: ${err.message}`)
            }
        }
        input.click()
    }

    const handleCreateToken = async () => {
        if (!newTokenName.trim()) return
        try {
            const { createToken } = await import('@/lib/shell/actions')
            const result = await createToken(newTokenName.trim())
            setRevealedToken(result)
            setNewTokenName('')
            // Refresh list
            const { listTokens } = await import('@/lib/shell/actions')
            listTokens().then(setTokens)
        } catch {
            setToast('Failed to create token')
        }
    }

    const handleRevoke = async (id: string) => {
        try {
            const { revokeToken } = await import('@/lib/shell/actions')
            await revokeToken(id)
            setTokens(t => t.map(tok => tok.id === id ? { ...tok, revokedAt: new Date() } : tok))
            setToast('Token revoked')
        } catch {
            setToast('Failed to revoke token')
        }
    }

    return (
        <div className="space-y-6 max-w-2xl">
            {toast && <HyggeToast message={toast} />}

            <HyggeCard>
                <div className="flex gap-8">
                    <div className="flex-1 flex flex-col">
                        <h3 className="text-sm font-medium mb-2">Data Export</h3>
                        <p className="text-xs text-[var(--hg-text-secondary)] mb-4 flex-1">
                            Export all your Chorum data in portable JSON format. Includes: learnings, scopes, feedback history, conversations.
                        </p>
                        <div>
                            <HyggeButton onClick={handleExport} variant="accent">export all data →</HyggeButton>
                        </div>
                    </div>
                    <div className="w-px bg-[var(--hg-border)]" />
                    <div className="flex-1 flex flex-col">
                        <h3 className="text-sm font-medium mb-2">Data Import</h3>
                        <p className="text-xs text-[var(--hg-text-secondary)] mb-4 flex-1">
                            Import existing Chorum profiles, learnings, or system seeds from a previous export.
                        </p>
                        <div>
                            <HyggeButton onClick={handleImport} variant="outline">import json ←</HyggeButton>
                        </div>
                    </div>
                </div>
            </HyggeCard>

            <HyggeCard>
                <h3 className="text-sm font-medium mb-2">API Tokens</h3>
                <p className="text-xs text-[var(--hg-text-secondary)] mb-4">
                    Generate Bearer tokens to access Chorum via the MCP Server from Claude Desktop or other local agents.
                </p>

                {revealedToken && (
                    <div className="mb-4 p-3 bg-[var(--hg-bg)] border-2 border-[var(--hg-accent)]">
                        <p className="text-xs font-mono text-[var(--hg-accent)] mb-1">TOKEN CREATED — copy now, it won't be shown again</p>
                        <div className="flex items-center gap-2">
                            <code className="text-xs text-[var(--hg-text-primary)] break-all flex-1 font-mono">{revealedToken.token}</code>
                            <button
                                className="text-xs text-[var(--hg-text-tertiary)] hover:text-[var(--hg-accent)] shrink-0"
                                onClick={() => { navigator.clipboard.writeText(revealedToken.token); setToast('Copied!') }}
                            >copy</button>
                        </div>
                        <button
                            className="text-xs text-[var(--hg-text-tertiary)] mt-2 hover:underline"
                            onClick={() => setRevealedToken(null)}
                        >dismiss</button>
                    </div>
                )}

                <div className="flex gap-2 mb-4">
                    <HyggeInput
                        value={newTokenName}
                        onChange={e => setNewTokenName(e.target.value)}
                        placeholder="Token name (e.g., claude-desktop)"
                        className="flex-1"
                    />
                    <HyggeButton
                        variant="accent"
                        onClick={handleCreateToken}
                        disabled={!newTokenName.trim()}
                    >generate</HyggeButton>
                </div>

                {loadingTokens ? (
                    <p className="text-xs text-[var(--hg-text-tertiary)]">Loading tokens...</p>
                ) : tokens.length === 0 ? (
                    <p className="text-xs text-[var(--hg-text-tertiary)]">No tokens yet.</p>
                ) : (
                    <div className="space-y-2">
                        {tokens.map(tok => (
                            <div key={tok.id} className="flex justify-between items-center py-2 border-b border-[var(--hg-border-subtle)] last:border-0">
                                <div>
                                    <span className="text-xs text-[var(--hg-text-primary)]">{tok.name}</span>
                                    <span className="ml-2 text-[10px] text-[var(--hg-text-tertiary)]">
                                        created {new Date(tok.createdAt).toLocaleDateString()}
                                        {tok.lastUsedAt && ` · used ${new Date(tok.lastUsedAt).toLocaleDateString()}`}
                                    </span>
                                </div>
                                {tok.revokedAt ? (
                                    <span className="text-[10px] text-[var(--hg-text-tertiary)] italic">revoked</span>
                                ) : (
                                    <button
                                        className="text-xs text-[var(--hg-destructive)] hover:underline"
                                        onClick={() => handleRevoke(tok.id)}
                                    >revoke</button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </HyggeCard>
        </div>
    )
}

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState('providers')
    const [userId, setUserId] = useState<string | null>(null)

    useEffect(() => {
        // Get the real userId from the server — consistent with auth context
        import('@/lib/shell/actions').then(m => m.getCurrentUserId().then(setUserId))
    }, [])

    if (!userId) return <div className="p-8 text-[var(--hg-text-tertiary)]">Loading settings...</div>

    const tabs = [
        { id: 'providers', label: 'Providers' },
        { id: 'memory', label: 'Memory' },
        { id: 'account', label: 'Account' }
    ]

    return (
        <div className="p-4 md:p-8 h-full overflow-y-auto w-full">
            <h1 className="text-xl font-medium mb-6">Settings</h1>

            <HyggeTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

            <div className="mt-8">
                {activeTab === 'providers' && <ProvidersTab userId={userId} />}
                {activeTab === 'memory' && <MemoryTab userId={userId} />}
                {activeTab === 'account' && <AccountTab />}
            </div>
        </div>
    )
}
