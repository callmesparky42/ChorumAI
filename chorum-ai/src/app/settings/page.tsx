'use client'
import { useState, useEffect, Suspense } from 'react'
import { Activity, Loader2, User, ExternalLink, Github, Wifi, WifiOff, RefreshCw, Download } from 'lucide-react'
import { KnowledgeGateway } from '@/components/KnowledgeGateway'
import { McpSettings } from '@/components/settings/McpSettings'
import { McpServersSettings } from '@/components/settings/McpServersSettings'
import { PendingLearnings } from '@/components/PendingLearnings'
import { SearchSettings } from '@/components/settings/SearchSettings'
import { HyggeButton } from '@/components/hygge/HyggeButton'
import { HyggeCard } from '@/components/hygge/HyggeCard'
import { HyggeToggle } from '@/components/hygge/HyggeToggle'
import Link from 'next/link'
import clsx from 'clsx'
import { useRouter, useSearchParams } from 'next/navigation'
import { useChorumStore } from '@/lib/store'

// Provider presets for the UI
// 'auto' means the router will select the best model based on task type
const PROVIDER_PRESETS: Record<string, { name: string, models: string[], requiresKey: boolean, isLocal: boolean, defaultBaseUrl?: string }> = {
    anthropic: { name: 'Anthropic (Claude)', models: ['auto', 'claude-sonnet-4-5-20250514', 'claude-sonnet-4-20250514', 'claude-haiku-4-5-20250514', 'claude-opus-4-5-20250514'], requiresKey: true, isLocal: false },
    openai: { name: 'OpenAI (GPT)', models: ['auto', 'gpt-5.2', 'gpt-5', 'gpt-4.1', 'gpt-4o', 'o1-preview', 'o1-mini'], requiresKey: true, isLocal: false },
    google: { name: 'Google (Gemini)', models: ['auto', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro'], requiresKey: true, isLocal: false },
    mistral: { name: 'Mistral AI', models: ['auto', 'mistral-large-latest', 'mistral-medium-latest', 'codestral-latest'], requiresKey: true, isLocal: false, defaultBaseUrl: 'https://api.mistral.ai/v1' },
    deepseek: { name: 'DeepSeek', models: ['auto', 'deepseek-chat', 'deepseek-coder'], requiresKey: true, isLocal: false, defaultBaseUrl: 'https://api.deepseek.com/v1' },
    perplexity: { name: 'Perplexity AI', models: ['llama-3.1-sonar-large-128k-online', 'llama-3.1-sonar-small-128k-online', 'llama-3.1-sonar-huge-128k-online'], requiresKey: true, isLocal: false, defaultBaseUrl: 'https://api.perplexity.ai' },
    xai: { name: 'xAI (Grok)', models: ['grok-2-latest', 'grok-2-vision-latest', 'grok-beta'], requiresKey: true, isLocal: false, defaultBaseUrl: 'https://api.x.ai/v1' },
    glm: { name: 'GLM-4 (Zhipu AI)', models: ['auto', 'glm-4-plus', 'glm-4-long', 'glm-4-flash', 'glm-4-flashx'], requiresKey: true, isLocal: false, defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
    ollama: { name: 'Ollama (Local)', models: ['phi3', 'llama3.3', 'mistral', 'phi4', 'codellama', 'gemma2', 'glm4'], requiresKey: false, isLocal: true, defaultBaseUrl: 'http://localhost:11434' },
    lmstudio: { name: 'LM Studio (Local)', models: ['local-model'], requiresKey: false, isLocal: true, defaultBaseUrl: 'http://localhost:1234/v1' },
    'openai-compatible': { name: 'OpenAI-Compatible API', models: ['custom'], requiresKey: false, isLocal: true }
}

interface Provider {
    id: string
    provider: string
    model: string
    dailyBudget: string
    spentToday?: number
    isActive: boolean
    baseUrl?: string
    isLocal?: boolean
    displayName?: string
}

interface UserSettings {
    name: string
    email: string
    bio: string
    securitySettings: {
        enforceHttps: boolean
        anonymizePii: boolean
        strictSsl: boolean
        logAllRequests: boolean
    }
    fallbackSettings: {
        enabled: boolean
        defaultProvider: string | null
        localFallbackModel: string | null
        priorityOrder: string[]
    }
    memorySettings: {
        autoLearn: boolean
        learningMode: 'sync' | 'async'
        injectContext: boolean
        autoSummarize: boolean
        validateResponses: boolean
        smartAgentRouting: boolean
    }
    backgroundOperationsSettings: {
        summarizationProvider: 'auto' | 'gemini-flash' | 'local'
        embeddingProvider: 'auto' | 'local'
    }
}

function SettingsContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    // activeTab from URL or default to 'providers'
    const activeTab = searchParams.get('tab') || 'providers'

    const [providers, setProviders] = useState<Provider[]>([])
    const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
    const [domainProjectId, setDomainProjectId] = useState<string | null>(null)
    const [domainSignal, setDomainSignal] = useState<{
        primary: string
        domains: { domain: string; confidence: number }[]
        conversationsAnalyzed: number
        computedAt: string
    } | null>(null)
    const [domainLoading, setDomainLoading] = useState(false)
    const [domainError, setDomainError] = useState<string | null>(null)

    const [userSettings, setUserSettings] = useState<UserSettings | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [showModal, setShowModal] = useState(false)
    const [showEditModal, setShowEditModal] = useState(false)
    const [editingProvider, setEditingProvider] = useState<Provider | null>(null)


    // Global Store Settings
    const { settings, updateSettings } = useChorumStore()

    // Manual summarization state
    const [summarizing, setSummarizing] = useState(false)
    const [summarizeResult, setSummarizeResult] = useState<{ success: boolean; message: string } | null>(null)
    const [summarizeProjectId, setSummarizeProjectId] = useState<string | null>(null)

    // Link analysis state
    const [analyzingLinks, setAnalyzingLinks] = useState(false)
    const [linkAnalysisResult, setLinkAnalysisResult] = useState<{ success: boolean; message: string } | null>(null)
    const [linkAnalysisProjectId, setLinkAnalysisProjectId] = useState<string | null>(null)

    // Background Operations state (local optimistic update until saved)
    const [bgOps, setBgOps] = useState<{
        summarizationProvider: 'auto' | 'gemini-flash' | 'local'
        embeddingProvider: 'auto' | 'local'
    }>({ summarizationProvider: 'auto', embeddingProvider: 'auto' })

    // Form - Provider (for add)
    const [formProvider, setFormProvider] = useState('anthropic')
    const [formModel, setFormModel] = useState('claude-sonnet-4-20250514')
    const [formKey, setFormKey] = useState('')
    const [formBudget, setFormBudget] = useState('10')
    const [formBaseUrl, setFormBaseUrl] = useState('')
    const [formDisplayName, setFormDisplayName] = useState('')

    // Local model discovery state
    const [localModels, setLocalModels] = useState<{
        ollama: { available: boolean; models: string[]; error?: string }
        lmstudio: { available: boolean; models: string[]; error?: string }
    }>({ ollama: { available: false, models: [] }, lmstudio: { available: false, models: [] } })
    const [fetchingLocalModels, setFetchingLocalModels] = useState(false)

    // Helper to check if provider needs API key
    const providerNeedsKey = (provider: string) => PROVIDER_PRESETS[provider]?.requiresKey ?? true
    const providerIsLocal = (provider: string) => PROVIDER_PRESETS[provider]?.isLocal ?? false

    // Fetch local models when selecting Ollama or LM Studio
    const fetchLocalModels = async (provider: 'ollama' | 'lmstudio') => {
        setFetchingLocalModels(true)
        try {
            const res = await fetch(`/api/local-models?provider=${provider}`)
            if (res.ok) {
                const data = await res.json()
                setLocalModels(prev => ({ ...prev, [provider]: data[provider] }))
                // Auto-select first available model
                if (data[provider]?.available && data[provider].models.length > 0) {
                    setFormModel(data[provider].models[0])
                }
            }
        } catch (e) {
            console.error('Failed to fetch local models:', e)
        } finally {
            setFetchingLocalModels(false)
        }
    }


    // Sub-tabs for Memory & Learning
    const [activeMemoryTab, setActiveMemoryTab] = useState<'settings' | 'knowledge'>('settings')

    useEffect(() => {
        fetchData()
    }, [activeTab])

    const fetchData = async () => {
        setLoading(true)
        try {
            if (activeTab === 'providers') {
                const res = await fetch('/api/providers')
                if (res.ok) setProviders(await res.json())
            } else if (activeTab === 'general' || activeTab === 'security' || activeTab === 'resilience') {
                // For resilience tab, we also need providers list for the dropdown
                const [settingsRes, providersRes] = await Promise.all([
                    fetch('/api/settings'),
                    activeTab === 'resilience' ? fetch('/api/providers') : Promise.resolve(null)
                ])
                if (settingsRes.ok) setUserSettings(await settingsRes.json())
                if (providersRes?.ok) setProviders(await providersRes.json())
            } else if (activeTab === 'memory') {
                // Fetch settings and projects for memory tab
                const [settingsRes, projectsRes] = await Promise.all([
                    fetch('/api/settings'),
                    fetch('/api/projects')
                ])
                if (settingsRes.ok) setUserSettings(await settingsRes.json())
                if (projectsRes.ok) {
                    const data = await projectsRes.json()
                    setProjects(data)
                    if (data.length > 0) {
                        if (!summarizeProjectId) setSummarizeProjectId(data[0].id)
                        if (!linkAnalysisProjectId) setLinkAnalysisProjectId(data[0].id)
                        if (!domainProjectId) setDomainProjectId(data[0].id)
                    }
                }
            } else if (activeTab === 'knowledge') {
                // Fetch projects for the project selector
                const res = await fetch('/api/projects')
                if (res.ok) {
                    const data = await res.json()
                    setProjects(data)
                    // Auto-select first project if none selected
                    if (!selectedProjectId && data.length > 0) {
                        setSelectedProjectId(data[0].id)
                    }
                }
            } else {
                setLoading(false)
            }
        } catch (e) {
            console.error(e)
        } finally {
            // Only set loading false here if we fetched something.
            // If static tab, we do it immediately.
            setLoading(false)
        }
    }

    const fetchDomainSignal = async (projectId: string, recompute: boolean = false) => {
        if (!projectId) return
        setDomainLoading(true)
        setDomainError(null)
        try {
            const url = recompute ? '/api/conductor/domain' : `/api/conductor/domain?projectId=${projectId}`
            const res = await fetch(url, {
                method: recompute ? 'POST' : 'GET',
                headers: { 'Content-Type': 'application/json' },
                body: recompute ? JSON.stringify({ projectId }) : undefined
            })
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || 'Failed to load domain signal')
            }
            const data = await res.json()
            setDomainSignal(data)
        } catch (e) {
            setDomainError(e instanceof Error ? e.message : 'Failed to load domain signal')
        } finally {
            setDomainLoading(false)
        }
    }

    useEffect(() => {
        if (activeTab !== 'memory') return
        if (domainProjectId) {
            fetchDomainSignal(domainProjectId)
        }
    }, [activeTab, domainProjectId])

    const handleTabChange = (tab: string) => {
        const url = new URL(window.location.href)
        url.searchParams.set('tab', tab)
        router.push(url.pathname + url.search)
    }

    const handleLogout = async () => {
        try {
            const { createClient } = await import('@/lib/supabase-client')
            const supabase = createClient()
            await supabase.auth.signOut()
            router.push('/login')
        } catch (error) {
            console.error('Logout failed:', error)
            alert('Failed to log out. Please try again.')
        }
    }

    const handleAddProvider = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            const preset = PROVIDER_PRESETS[formProvider]
            const res = await fetch('/api/providers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: formProvider,
                    model: formModel,
                    apiKey: formKey || undefined,
                    dailyBudget: formBudget,
                    baseUrl: formBaseUrl || preset?.defaultBaseUrl || undefined,
                    isLocal: preset?.isLocal || false,
                    displayName: formDisplayName || undefined
                })
            })
            if (res.ok) {
                setShowModal(false)
                resetForm()
                fetchData()
            } else {
                const err = await res.json()
                alert(`Failed to add provider: ${err.error || 'Unknown error'}`)
            }
        } catch (e) {
            console.error(e)
            alert('Failed to add provider. Check console for details.')
        }
    }

    const handleEditProvider = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingProvider) return
        try {
            const res = await fetch('/api/providers', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editingProvider.id,
                    model: formModel,
                    dailyBudget: formBudget,
                    baseUrl: formBaseUrl || undefined,
                    displayName: formDisplayName || undefined
                })
            })
            if (res.ok) {
                setShowEditModal(false)
                setEditingProvider(null)
                resetForm()
                fetchData()
            }
        } catch (e) {
            console.error(e)
        }
    }

    const openEditModal = (provider: Provider) => {
        setEditingProvider(provider)
        setFormProvider(provider.provider)
        setFormModel(provider.model)
        setFormBudget(provider.dailyBudget)
        setFormBaseUrl(provider.baseUrl || '')
        setFormDisplayName(provider.displayName || '')
        setShowEditModal(true)
    }

    const resetForm = () => {
        setFormProvider('anthropic')
        setFormModel('claude-sonnet-4-20250514')
        setFormKey('')
        setFormBudget('10')
        setFormBaseUrl('')
        setFormDisplayName('')
    }

    const handleDeleteProvider = async (id: string) => {
        if (!confirm('Remove this provider? Keys will be deleted.')) return
        try {
            await fetch(`/api/providers?id=${id}`, { method: 'DELETE' })
            fetchData()
        } catch (e) {
            console.error(e)
        }
    }

    const handleUpdateSettings = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        if (!userSettings) return

        setSaving(true)
        try {
            const res = await fetch('/api/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userSettings)
            })
            if (res.ok) {
                // Flash success or no-op
            }
        } catch (err) {
            console.error(err)
        } finally {
            setSaving(false)
        }
    }

    const menuItems = [
        { id: 'providers', label: 'Providers' },
        { id: 'general', label: 'General' },
        { id: 'security', label: 'Security' },
        { id: 'memory', label: 'Memory & Learning' },
        { id: 'mcp', label: 'API Tokens' },
        { id: 'mcp-servers', label: 'MCP Servers' },
        { id: 'resilience', label: 'Resilience' },
        { id: 'help', label: 'Help' },
        { id: 'about', label: 'About' },
    ]

    return (
        <div className="flex h-screen bg-[var(--hg-bg)] text-[var(--hg-text-primary)]">
            <div className="hidden md:block">
                <div className="w-64 h-full bg-[var(--hg-bg)] border-r border-[var(--hg-border)] p-4">
                    <Link href="/app" className="hg-btn w-full text-left mb-6">
                        ← Back to Chat
                    </Link>
                    <h1 className="text-xl font-semibold mb-4">Settings</h1>
                    <div className="space-y-1 flex-1">
                        {menuItems.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => handleTabChange(item.id)}
                                className={clsx(
                                    "w-full text-left px-3 py-2 text-sm font-medium transition-colors border-l-2",
                                    activeTab === item.id
                                        ? "border-[var(--hg-accent)] text-[var(--hg-text-primary)] bg-[var(--hg-surface)]"
                                        : "border-transparent text-[var(--hg-text-secondary)] hover:text-[var(--hg-text-primary)] hover:bg-[var(--hg-surface-hover)]"
                                )}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-[var(--hg-border)]">
                        <HyggeButton
                            variant="destructive"
                            onClick={handleLogout}
                            className="w-full text-left"
                        >
                            Log Out
                        </HyggeButton>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 max-w-4xl">
                {/* Providers Tab */}
                {activeTab === 'providers' && (
                    <>
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h2 className="text-2xl font-semibold">Model Providers</h2>
                                <p className="text-[var(--hg-text-secondary)] mt-1">Configure API keys and budgets for the Routing Engine.</p>
                            </div>
                            <HyggeButton
                                variant="accent"
                                onClick={() => setShowModal(true)}
                                className="text-sm"
                            >
                                Add Provider
                            </HyggeButton>
                        </div>

                        {/* Total Usage Summary */}
                        {!loading && providers.length > 0 && (
                            <HyggeCard className="mb-6 flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-[var(--hg-text-tertiary)] font-medium">Total Usage Today</p>
                                    <p className="text-2xl font-semibold text-[var(--hg-text-primary)]">
                                        ${providers.reduce((acc, p) => acc + (Number(p.spentToday) || 0), 0).toFixed(4)}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm text-[var(--hg-text-tertiary)] font-medium">Total Daily Budget</p>
                                    <p className="text-lg font-medium text-[var(--hg-text-secondary)]">
                                        ${providers.reduce((acc, p) => acc + (Number(p.dailyBudget) || 0), 0).toFixed(2)}
                                    </p>
                                </div>
                            </HyggeCard>
                        )}

                        {loading ? (
                            <div className="flex justify-center p-12"><Loader2 className="animate-spin text-gray-500" /></div>
                        ) : providers.length === 0 ? (
                            <div className="text-center p-12 border border-dashed border-[var(--hg-border)]">
                                <p className="text-[var(--hg-text-tertiary)]">No active providers configured.</p>
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {providers.map(p => (
                                    <HyggeCard key={p.id} className="flex items-start justify-between">
                                        <div>
                                            <h3 className="font-medium text-sm text-[var(--hg-text-primary)]">
                                                {p.displayName || PROVIDER_PRESETS[p.provider]?.name || p.provider}
                                            </h3>
                                            <div className="text-xs font-mono text-[var(--hg-text-tertiary)] mt-1">
                                                {p.model}{p.isLocal ? ' · local' : ''}
                                            </div>
                                            <div className="flex items-center gap-6 mt-3 text-sm text-[var(--hg-text-secondary)]">
                                                <span>Today: ${Number(p.spentToday || 0).toFixed(4)}</span>
                                                <span>Budget: ${Number(p.dailyBudget).toFixed(2)}</span>
                                                <span className="text-[var(--hg-text-tertiary)]">
                                                    {p.isActive ? 'active' : 'inactive'}
                                                </span>
                                                {p.baseUrl && (
                                                    <span className="text-xs text-[var(--hg-text-tertiary)] font-mono truncate max-w-[220px]" title={p.baseUrl}>
                                                        {p.baseUrl}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <HyggeButton onClick={() => openEditModal(p)} className="text-xs">
                                                edit
                                            </HyggeButton>
                                            <HyggeButton onClick={() => handleDeleteProvider(p.id)} variant="destructive" className="text-xs">
                                                remove
                                            </HyggeButton>
                                        </div>
                                    </HyggeCard>
                                ))}
                            </div>
                        )}

                        {/* Background Operations Section */}
                        <HyggeCard className="mt-8 p-6">
                            <div className="mb-6">
                                <h3 className="text-lg font-medium text-[var(--hg-text-primary)]">Background Operations</h3>
                                <p className="text-sm text-[var(--hg-text-secondary)]">Configure models used for summarization and embedding tasks.</p>
                            </div>

                            <div className="space-y-6 max-w-2xl">
                                {/* Summarization Provider */}
                                <div>
                                    <label className="block text-sm font-medium text-[var(--hg-text-secondary)] mb-2">Summarization Provider</label>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <button
                                            onClick={() => {
                                                const newSettings = {
                                                    ...userSettings,
                                                    backgroundOperationsSettings: { ...userSettings?.backgroundOperationsSettings, summarizationProvider: 'auto' }
                                                }
                                                // @ts-ignore
                                                setUserSettings(newSettings)
                                            }}
                                            className={clsx(
                                                "p-3 border text-left transition-colors",
                                                userSettings?.backgroundOperationsSettings?.summarizationProvider === 'auto' || !userSettings?.backgroundOperationsSettings?.summarizationProvider
                                                    ? "bg-[var(--hg-accent-muted)] border-[var(--hg-accent)] text-[var(--hg-accent)]"
                                                    : "bg-[var(--hg-bg)] border-[var(--hg-border)] text-[var(--hg-text-secondary)] hover:border-[var(--hg-border-subtle)]"
                                            )}
                                        >
                                            <div className="font-medium mb-1">Auto</div>
                                            <div className="text-xs text-[var(--hg-text-tertiary)]">Cheapest available (Default)</div>
                                        </button>

                                        <button
                                            onClick={() => {
                                                const newSettings = {
                                                    ...userSettings,
                                                    backgroundOperationsSettings: { ...userSettings?.backgroundOperationsSettings, summarizationProvider: 'gemini-flash' }
                                                }
                                                // @ts-ignore
                                                setUserSettings(newSettings)
                                            }}
                                            className={clsx(
                                                "p-3 border text-left transition-colors",
                                                userSettings?.backgroundOperationsSettings?.summarizationProvider === 'gemini-flash'
                                                    ? "bg-[var(--hg-accent-muted)] border-[var(--hg-accent)] text-[var(--hg-accent)]"
                                                    : "bg-[var(--hg-bg)] border-[var(--hg-border)] text-[var(--hg-text-secondary)] hover:border-[var(--hg-border-subtle)]"
                                            )}
                                        >
                                            <div className="font-medium mb-1">Gemini Flash</div>
                                            <div className="text-xs text-[var(--hg-text-tertiary)]">Coming soon</div>
                                        </button>

                                        <button
                                            onClick={() => {
                                                const newSettings = {
                                                    ...userSettings,
                                                    backgroundOperationsSettings: { ...userSettings?.backgroundOperationsSettings, summarizationProvider: 'local' }
                                                }
                                                // @ts-ignore
                                                setUserSettings(newSettings)
                                            }}
                                            className={clsx(
                                                "p-3 border text-left transition-colors",
                                                userSettings?.backgroundOperationsSettings?.summarizationProvider === 'local'
                                                    ? "bg-[var(--hg-accent-muted)] border-[var(--hg-accent)] text-[var(--hg-accent)]"
                                                    : "bg-[var(--hg-bg)] border-[var(--hg-border)] text-[var(--hg-text-secondary)] hover:border-[var(--hg-border-subtle)]"
                                            )}
                                        >
                                            <div className="font-medium mb-1">Local Only</div>
                                            <div className="text-xs text-[var(--hg-text-tertiary)]">Ollama / LM Studio</div>
                                        </button>
                                    </div>
                                </div>

                                <div className="pt-4 flex justify-end">
                                    <HyggeButton
                                        variant="accent"
                                        onClick={(e) => handleUpdateSettings(e)}
                                        disabled={saving}
                                        className="text-sm"
                                    >
                                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                        Save Changes
                                    </HyggeButton>
                                </div>
                            </div>
                        </HyggeCard>
                    </>
                )}

                {/* General Tab */}
                {activeTab === 'general' && (
                    <>
                        <div className="mb-8">
                            <h2 className="text-2xl font-semibold">General Settings</h2>
                            <p className="text-[var(--hg-text-secondary)] mt-1">Manage your profile and personal context.</p>
                        </div>

                        {loading ? (
                            <div className="flex justify-center p-12"><Loader2 className="animate-spin text-gray-500" /></div>
                        ) : !userSettings ? (
                            <div className="text-[var(--hg-destructive)]">Failed to load settings.</div>
                        ) : (
                            <form onSubmit={handleUpdateSettings} className="space-y-6 max-w-2xl bg-[var(--hg-surface)] p-6 border border-[var(--hg-border)]">
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-[var(--hg-text-secondary)] mb-2">Display Name</label>
                                        <input
                                            type="text"
                                            value={userSettings.name || ''}
                                            onChange={e => setUserSettings({ ...userSettings, name: e.target.value })}
                                            className="w-full bg-[var(--hg-bg)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-primary)] focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[var(--hg-text-secondary)] mb-2">Email</label>
                                        <input
                                            type="email"
                                            value={userSettings.email || ''}
                                            onChange={e => setUserSettings({ ...userSettings, email: e.target.value })}
                                            className="w-full bg-[var(--hg-bg)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-primary)] focus:outline-none"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-[var(--hg-text-secondary)] mb-2">Personal Profile / Bio</label>
                                    <p className="text-xs text-[var(--hg-text-tertiary)] mb-3">
                                        Information about you that helps LLMs personalize their responses (e.g., "Software Engineer focused on React", "Prefer concise answers").
                                    </p>
                                    <textarea
                                        value={userSettings.bio || ''}
                                        onChange={e => setUserSettings({ ...userSettings, bio: e.target.value })}
                                        className="w-full bg-[var(--hg-bg)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-primary)] focus:outline-none min-h-[120px]"
                                    />
                                </div>

                                <div className="pt-4 flex justify-end">
                                    <HyggeButton
                                        type="submit"
                                        variant="accent"
                                        loading={saving}
                                    >
                                        Save Changes
                                    </HyggeButton>
                                </div>
                            </form>
                        )}

                        {/* UI Preferences (Client-side only) */}
                        <div className="mt-8">
                            <h3 className="text-xl font-semibold mb-4">UI Preferences</h3>
                            <HyggeCard className="space-y-2">
                                <HyggeToggle
                                    checked={settings.showCost}
                                    onChange={(v) => updateSettings({ showCost: v })}
                                    label="Show Message Costs"
                                    description="Display the estimated cost (USD) for each AI response in the chat thread."
                                />
                            </HyggeCard>
                        </div>
                        {/* Web Search Settings (Moved from top-level) */}
                        <div className="mt-8">
                            <SearchSettings />
                        </div>
                    </>
                )}

                {/* Security Tab */}
                {activeTab === 'security' && (
                    <>
                        <div className="mb-8">
                            <h2 className="text-2xl font-semibold">Security Settings</h2>
                            <p className="text-gray-400 mt-1">Configure security protocols for LLM interactions.</p>
                        </div>

                        {loading ? (
                            <div className="flex justify-center p-12"><Loader2 className="animate-spin text-gray-500" /></div>
                        ) : !userSettings ? (
                            <div className="text-[var(--hg-destructive)]">Failed to load settings.</div>
                        ) : (
                            <div className="max-w-2xl space-y-4">
                                <HyggeCard className="space-y-2">
                                    <HyggeToggle
                                        checked={!!userSettings.securitySettings?.enforceHttps}
                                        onChange={(v) => setUserSettings({ ...userSettings, securitySettings: { ...userSettings.securitySettings, enforceHttps: v } })}
                                        label="Enforce HTTPS Only"
                                        description="Require encrypted HTTPS connections for all external API endpoints. Localhost connections are exempt."
                                    />
                                    <HyggeToggle
                                        checked={!!userSettings.securitySettings?.anonymizePii}
                                        onChange={(v) => setUserSettings({ ...userSettings, securitySettings: { ...userSettings.securitySettings, anonymizePii: v } })}
                                        label="Anonymize PII"
                                        description="Detect and redact emails, phone numbers, SSNs, and credit cards before provider calls."
                                    />
                                    <HyggeToggle
                                        checked={!!userSettings.securitySettings?.strictSsl}
                                        onChange={(v) => setUserSettings({ ...userSettings, securitySettings: { ...userSettings.securitySettings, strictSsl: v } })}
                                        label="Strict SSL Verification"
                                        description="Enforce full SSL/TLS certificate validation for local provider connections."
                                    />
                                    <HyggeToggle
                                        checked={!!userSettings.securitySettings?.logAllRequests}
                                        onChange={(v) => setUserSettings({ ...userSettings, securitySettings: { ...userSettings.securitySettings, logAllRequests: v } })}
                                        label="Audit Logging"
                                        description="Record detailed logs of every LLM request for compliance and debugging."
                                    />
                                </HyggeCard>

                                <div className="pt-4 flex justify-between items-center">
                                    <HyggeButton
                                        onClick={async () => {
                                            try {
                                                const response = await fetch('/api/audit-logs')
                                                if (!response.ok) throw new Error('Failed to export')
                                                const blob = await response.blob()
                                                const url = window.URL.createObjectURL(blob)
                                                const a = document.createElement('a')
                                                a.href = url
                                                a.download = `chorum-audit-log-${new Date().toISOString().split('T')[0]}.md`
                                                document.body.appendChild(a)
                                                a.click()
                                                window.URL.revokeObjectURL(url)
                                                document.body.removeChild(a)
                                            } catch (e) {
                                                console.error('Failed to download audit logs:', e)
                                            }
                                        }}
                                    >
                                        <Download className="w-4 h-4 mr-2 inline-block" />
                                        Download Audit Logs
                                    </HyggeButton>
                                    <HyggeButton
                                        variant="accent"
                                        onClick={(e) => handleUpdateSettings(e)}
                                        disabled={saving}
                                        className="text-sm"
                                    >
                                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                        Save Changes
                                    </HyggeButton>
                                </div>
                            </div>
                        )}
                    </>
                )}




                {/* MCP Integration Tab */}
                {activeTab === 'mcp' && (
                    <>
                        <div className="mb-8">
                            <h2 className="text-2xl font-semibold">MCP Integration</h2>
                            <p className="text-[var(--hg-text-secondary)] mt-1">Connect external AI agents to your ChorumAI memory.</p>
                        </div>

                        <div className="space-y-8">
                            {/* Pending Learnings Section */}
                            <HyggeCard className="p-6">
                                <PendingLearnings />
                            </HyggeCard>

                            {/* MCP Settings Section */}
                            <HyggeCard className="p-6">
                                <McpSettings />
                            </HyggeCard>
                        </div>
                    </>
                )}

                {/* MCP Servers Tab */}
                {activeTab === 'mcp-servers' && (
                    <>
                        <div className="mb-8">
                            <h2 className="text-2xl font-semibold">MCP Servers</h2>
                            <p className="text-[var(--hg-text-secondary)] mt-1">Connect to external MCP servers for tools like web search.</p>
                        </div>

                        <HyggeCard className="p-6">
                            <McpServersSettings />
                        </HyggeCard>
                    </>
                )}

                {/* Resilience Tab */}
                {activeTab === 'resilience' && (
                    <>
                        <div className="mb-8">
                            <h2 className="text-2xl font-semibold">Resilience & Fallback</h2>
                            <p className="text-[var(--hg-text-secondary)] mt-1">Configure automatic failover when providers are unavailable.</p>
                        </div>

                        {loading ? (
                            <div className="flex justify-center p-12"><Loader2 className="animate-spin text-gray-500" /></div>
                        ) : !userSettings ? (
                            <div className="text-[var(--hg-destructive)]">Failed to load settings.</div>
                        ) : (
                            <HyggeCard className="max-w-2xl p-6 space-y-6">
                                <HyggeToggle
                                    checked={userSettings.fallbackSettings?.enabled ?? true}
                                    onChange={(value) => {
                                        const newSettings = {
                                            ...userSettings,
                                            fallbackSettings: {
                                                ...userSettings.fallbackSettings,
                                                enabled: value
                                            }
                                        }
                                        setUserSettings(newSettings)
                                    }}
                                    label="Enable Automatic Fallback"
                                    description="When a provider fails (network error, rate limit, auth issue), automatically try other configured providers."
                                />

                                {/* Default fallback provider */}
                                <div className="p-4 bg-[var(--hg-bg)] border border-[var(--hg-border)]">
                                    <h3 className="font-medium text-[var(--hg-text-primary)] mb-1">Default Fallback Provider</h3>
                                    <p className="text-sm text-[var(--hg-text-tertiary)] mb-3">
                                        If something breaks, which provider should we try first? This is your "known good" option.
                                    </p>
                                    <select
                                        value={userSettings.fallbackSettings?.defaultProvider || ''}
                                        onChange={(e) => {
                                            const newSettings = {
                                                ...userSettings,
                                                fallbackSettings: {
                                                    ...userSettings.fallbackSettings,
                                                    enabled: userSettings.fallbackSettings?.enabled ?? true,
                                                    defaultProvider: e.target.value || null,
                                                    localFallbackModel: userSettings.fallbackSettings?.localFallbackModel ?? null,
                                                    priorityOrder: userSettings.fallbackSettings?.priorityOrder ?? []
                                                }
                                            }
                                            setUserSettings(newSettings)
                                        }}
                                        className="w-full bg-[var(--hg-bg)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-primary)]"
                                    >
                                        <option value="">Auto (use routing priority)</option>
                                        {providers.filter(p => !p.isLocal).map(p => (
                                            <option key={p.id} value={p.provider}>
                                                {p.displayName || PROVIDER_PRESETS[p.provider]?.name || p.provider}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Local/offline fallback */}
                                <div className="p-4 bg-[var(--hg-bg)] border border-[var(--hg-border)]">
                                    <h3 className="font-medium text-[var(--hg-text-primary)] mb-1">Offline Fallback (Local Model)</h3>
                                    <p className="text-sm text-[var(--hg-text-tertiary)] mb-3">
                                        If all cloud providers fail (internet outage?), try a local model via Ollama. Leave empty to auto-detect.
                                    </p>
                                    <input
                                        type="text"
                                        value={userSettings.fallbackSettings?.localFallbackModel || ''}
                                        onChange={(e) => {
                                            const newSettings = {
                                                ...userSettings,
                                                fallbackSettings: {
                                                    ...userSettings.fallbackSettings,
                                                    enabled: userSettings.fallbackSettings?.enabled ?? true,
                                                    defaultProvider: userSettings.fallbackSettings?.defaultProvider ?? null,
                                                    localFallbackModel: e.target.value || null,
                                                    priorityOrder: userSettings.fallbackSettings?.priorityOrder ?? []
                                                }
                                            }
                                            setUserSettings(newSettings)
                                        }}
                                        className="w-full bg-[var(--hg-bg)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-primary)] font-mono"
                                        placeholder="llama3 (auto-detect if empty)"
                                    />
                                    <p className="text-xs text-[var(--hg-text-tertiary)] mt-2">
                                        Common models: llama3, mistral, phi3, codellama, gemma2
                                    </p>
                                </div>

                                {/* Info box */}
                                <div className="p-4 bg-[var(--hg-bg)] border border-[var(--hg-border)]">
                                    <h4 className="text-sm font-medium text-[var(--hg-text-primary)] mb-2">How Fallback Works</h4>
                                    <ul className="text-sm text-[var(--hg-text-secondary)] space-y-1 list-disc pl-4">
                                        <li>Primary provider fails → tries alternatives from routing</li>
                                        <li>If you set a default, it becomes first alternative</li>
                                        <li>Network/timeout errors trigger fallback automatically</li>
                                        <li>Auth errors (bad API key) also trigger fallback</li>
                                        <li>Local models (Ollama) are last resort for offline scenarios</li>
                                    </ul>
                                </div>

                                <div className="pt-4 flex justify-end">
                                    <HyggeButton
                                        variant="accent"
                                        onClick={(e) => handleUpdateSettings(e)}
                                        disabled={saving}
                                        className="text-sm"
                                    >
                                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                        Save Changes
                                    </HyggeButton>
                                </div>
                            </HyggeCard>
                        )}
                    </>
                )}
                {/* Memory Tab */}
                {activeTab === 'memory' && (
                    <>
                        <div className="mb-0">
                            <h2 className="text-2xl font-semibold">Memory & Learning</h2>
                            <p className="text-gray-400 mt-1">Control how ChorumAI learns from conversations and manages context.</p>
                        </div>

                        {/* Memory Sub-tabs */}
                        <div className="flex border-b border-[var(--hg-border)] mb-6 mt-4">
                            <button
                                onClick={() => setActiveMemoryTab('settings')}
                                className={clsx(
                                    "px-4 py-2 text-sm font-medium transition-colors border-b",
                                    activeMemoryTab === 'settings'
                                        ? "border-[var(--hg-accent)] text-[var(--hg-text-primary)]"
                                        : "border-transparent text-[var(--hg-text-tertiary)] hover:text-[var(--hg-text-secondary)]"
                                )}
                            >
                                Settings
                            </button>
                            <button
                                onClick={() => setActiveMemoryTab('knowledge')}
                                className={clsx(
                                    "px-4 py-2 text-sm font-medium transition-colors border-b",
                                    activeMemoryTab === 'knowledge'
                                        ? "border-[var(--hg-accent)] text-[var(--hg-text-primary)]"
                                        : "border-transparent text-[var(--hg-text-tertiary)] hover:text-[var(--hg-text-secondary)]"
                                )}
                            >
                                Learned Knowledge
                            </button>
                        </div>

                        {loading ? (
                            <div className="flex justify-center p-12"><Loader2 className="animate-spin text-gray-500" /></div>
                        ) : !userSettings ? (
                            <div className="text-[var(--hg-destructive)]">Failed to load settings.</div>
                        ) : (<>
                            {activeMemoryTab === 'settings' ? (
                                <div className="max-w-2xl space-y-6">
                                    {/* Project Domain Signal */}
                                    <HyggeCard className="p-6 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="text-lg font-medium text-[var(--hg-text-primary)]">
                                                    Project Domain
                                                </h3>
                                                <p className="text-sm text-[var(--hg-text-tertiary)] mt-1">
                                                    What Chorum thinks this project is about.
                                                </p>
                                            </div>
                                            <HyggeButton
                                                onClick={() => domainProjectId && fetchDomainSignal(domainProjectId, true)}
                                                disabled={domainLoading || !domainProjectId}
                                                className="p-2"
                                                title="Recompute domain signal"
                                            >
                                                <RefreshCw className={clsx("w-3.5 h-3.5", domainLoading && "animate-spin")} />
                                            </HyggeButton>
                                        </div>

                                        {projects.length > 0 && (
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs uppercase tracking-wide text-[var(--hg-text-tertiary)]">Project</span>
                                                <select
                                                    value={domainProjectId || ''}
                                                    onChange={(e) => setDomainProjectId(e.target.value)}
                                                    className="bg-[var(--hg-bg)] border border-[var(--hg-border)] text-[var(--hg-text-primary)] text-sm px-3 py-2 flex-1"
                                                >
                                                    {projects.map(project => (
                                                        <option key={project.id} value={project.id}>{project.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        {domainError && (
                                            <div className="text-sm text-[var(--hg-destructive)]">{domainError}</div>
                                        )}

                                        {!domainError && (
                                            <div className="bg-[var(--hg-bg)] border border-[var(--hg-border)] p-4">
                                                {domainLoading ? (
                                                    <div className="text-sm text-[var(--hg-text-tertiary)] flex items-center gap-2">
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        Analyzing domain signal...
                                                    </div>
                                                ) : domainSignal ? (
                                                    <>
                                                        <div className="text-sm text-[var(--hg-text-secondary)]">
                                                            Primary: <span className="text-[var(--hg-text-primary)] font-medium">{domainSignal.primary}</span>
                                                            {domainSignal.domains?.[0]?.confidence !== undefined && (
                                                                <span className="text-[var(--hg-text-tertiary)]"> ({domainSignal.domains[0].confidence.toFixed(2)})</span>
                                                            )}
                                                        </div>
                                                        {domainSignal.domains?.length > 1 && (
                                                            <div className="text-xs text-[var(--hg-text-tertiary)] mt-2">
                                                                Also: {domainSignal.domains.slice(1, 4).map(d => `${d.domain} (${d.confidence.toFixed(2)})`).join(', ')}
                                                            </div>
                                                        )}
                                                        <div className="text-xs text-[var(--hg-text-tertiary)] mt-3">
                                                            Based on {domainSignal.conversationsAnalyzed} messages • Updated {new Date(domainSignal.computedAt).toLocaleString()}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="text-sm text-[var(--hg-text-tertiary)]">
                                                        Chorum hasn't determined what this project is about yet. Start a conversation and it'll figure it out.
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </HyggeCard>

                                    {/* Learning & Context Section */}
                                    <HyggeCard className="p-6 space-y-4">
                                        <h3 className="text-lg font-medium text-[var(--hg-text-primary)]">
                                            Learning & Context
                                        </h3>

                                        <HyggeToggle
                                            checked={!!userSettings.memorySettings?.autoLearn}
                                            onChange={(value) => {
                                                const newSettings = { ...userSettings, memorySettings: { ...userSettings.memorySettings, autoLearn: value } }
                                                setUserSettings(newSettings)
                                            }}
                                            label="Auto-Learn Patterns"
                                            description="Extract patterns, decisions, and invariants from conversations for future context."
                                        />

                                        {userSettings.memorySettings?.autoLearn && (
                                            <div className="flex items-center justify-between py-3 border-b border-[var(--hg-border)]">
                                                <div className="flex-1 pr-8">
                                                    <span className="text-sm text-[var(--hg-text-primary)]">Processing Mode</span>
                                                    <p className="text-xs text-[var(--hg-text-tertiary)] mt-0.5">
                                                        {userSettings.memorySettings?.learningMode === 'async'
                                                            ? 'Background processing - no latency impact'
                                                            : 'Immediate processing - adds ~500-1000ms latency'}
                                                    </p>
                                                </div>
                                                <select
                                                    value={userSettings.memorySettings?.learningMode || 'async'}
                                                    onChange={(e) => {
                                                        const newSettings = { ...userSettings, memorySettings: { ...userSettings.memorySettings, learningMode: e.target.value as 'sync' | 'async' } }
                                                        setUserSettings(newSettings)
                                                    }}
                                                    className="bg-[var(--hg-bg)] border border-[var(--hg-border)] text-[var(--hg-text-primary)] text-sm px-3 py-2"
                                                >
                                                    <option value="async">Async (Background)</option>
                                                    <option value="sync">Sync (Immediate)</option>
                                                </select>
                                            </div>
                                        )}

                                        <HyggeToggle
                                            checked={userSettings.memorySettings?.injectContext !== false}
                                            onChange={(value) => {
                                                const newSettings = { ...userSettings, memorySettings: { ...userSettings.memorySettings, injectContext: value } }
                                                setUserSettings(newSettings)
                                            }}
                                            label="Inject Learned Context"
                                            description="Add patterns and invariants to prompts. Adds ~50-100ms latency."
                                        />
                                    </HyggeCard>

                                    {/* Response Processing Section */}
                                    <HyggeCard className="p-6 space-y-4">
                                        <h3 className="text-lg font-medium text-[var(--hg-text-primary)]">
                                            Response Processing
                                        </h3>

                                        <HyggeToggle
                                            checked={userSettings.memorySettings?.autoSummarize !== false}
                                            onChange={(value) => {
                                                const newSettings = { ...userSettings, memorySettings: { ...userSettings.memorySettings, autoSummarize: value } }
                                                setUserSettings(newSettings)
                                            }}
                                            label="Auto-Summarize Conversations"
                                            description="Compress old messages into summaries for context management. Adds ~800ms latency."
                                        />

                                        {/* Manual Summarize - shown when auto-summarize is OFF */}
                                        {userSettings.memorySettings?.autoSummarize === false && (
                                            <div className="p-4 bg-[var(--hg-bg)] border border-[var(--hg-border)] space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h4 className="font-medium text-[var(--hg-text-primary)] mb-1">Manual Summarization</h4>
                                                        <p className="text-sm text-[var(--hg-text-tertiary)]">Manually trigger summarization for a project when needed.</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <select
                                                        value={summarizeProjectId || ''}
                                                        onChange={(e) => {
                                                            setSummarizeProjectId(e.target.value)
                                                            setSummarizeResult(null)
                                                        }}
                                                        className="flex-1 bg-[var(--hg-bg)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-primary)] text-sm focus:outline-none"
                                                    >
                                                        {projects.length === 0 && (
                                                            <option value="">No projects available</option>
                                                        )}
                                                        {projects.map(p => (
                                                            <option key={p.id} value={p.id}>{p.name}</option>
                                                        ))}
                                                    </select>
                                                    <HyggeButton
                                                        variant="accent"
                                                        onClick={async () => {
                                                            if (!summarizeProjectId) return
                                                            setSummarizing(true)
                                                            setSummarizeResult(null)
                                                            try {
                                                                const res = await fetch('/api/summarize', {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ projectId: summarizeProjectId })
                                                                })
                                                                const data = await res.json()
                                                                if (data.success) {
                                                                    setSummarizeResult({ success: true, message: data.message })
                                                                } else {
                                                                    setSummarizeResult({ success: false, message: data.message || data.error })
                                                                }
                                                            } catch (e: any) {
                                                                setSummarizeResult({ success: false, message: e.message })
                                                            } finally {
                                                                setSummarizing(false)
                                                            }
                                                        }}
                                                        disabled={summarizing || !summarizeProjectId || projects.length === 0}
                                                        className="text-sm"
                                                    >
                                                        {summarizing ? (
                                                            <>
                                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                                Summarizing...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <RefreshCw className="w-4 h-4" />
                                                                Summarize Now
                                                            </>
                                                        )}
                                                    </HyggeButton>
                                                </div>
                                                {summarizeResult && (
                                                    <p className={clsx("text-sm", summarizeResult.success ? "text-[var(--hg-accent)]" : "text-[var(--hg-destructive)]")}>
                                                        {summarizeResult.message}
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        <HyggeToggle
                                            checked={userSettings.memorySettings?.validateResponses !== false}
                                            onChange={(value) => {
                                                const newSettings = { ...userSettings, memorySettings: { ...userSettings.memorySettings, validateResponses: value } }
                                                setUserSettings(newSettings)
                                            }}
                                            label="Validate Against Invariants"
                                            description="Check responses for rule violations. Adds ~100-200ms latency."
                                        />
                                    </HyggeCard>

                                    {/* Agent Selection Section */}
                                    <HyggeCard className="p-6 space-y-4">
                                        <h3 className="text-lg font-medium text-[var(--hg-text-primary)]">
                                            Agent Selection
                                        </h3>

                                        <HyggeToggle
                                            checked={userSettings.memorySettings?.smartAgentRouting !== false}
                                            onChange={(value) => {
                                                const newSettings = { ...userSettings, memorySettings: { ...userSettings.memorySettings, smartAgentRouting: value } }
                                                setUserSettings(newSettings)
                                            }}
                                            label="Smart Agent Routing"
                                            description="Auto-select the best agent for each message. Adds ~20-50ms latency. When OFF, uses manually selected agent only."
                                        />
                                    </HyggeCard>

                                    {/* Performance Mode Section */}
                                    <HyggeCard className="p-6">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="text-lg font-medium text-[var(--hg-text-primary)]">
                                                    Minimal Latency Mode
                                                </h3>
                                                <p className="text-sm text-[var(--hg-text-tertiary)] mt-1">Disables all background processing for fastest response times.</p>
                                            </div>
                                            <HyggeButton
                                                variant="accent"
                                                onClick={() => {
                                                    const newSettings = {
                                                        ...userSettings,
                                                        memorySettings: {
                                                            autoLearn: false,
                                                            learningMode: 'async' as const,
                                                            injectContext: false,
                                                            autoSummarize: false,
                                                            validateResponses: false,
                                                            smartAgentRouting: false
                                                        }
                                                    }
                                                    setUserSettings(newSettings)
                                                }}
                                            >
                                                Enable Minimal Mode
                                            </HyggeButton>
                                        </div>
                                    </HyggeCard>

                                    {/* Save Button */}
                                    <div className="pt-4 flex justify-end">
                                        <HyggeButton
                                            variant="accent"
                                            onClick={(e) => handleUpdateSettings(e)}
                                            disabled={saving}
                                            className="text-sm"
                                        >
                                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                            Save Changes
                                        </HyggeButton>
                                    </div>
                                </div>
                            ) : null}

                            {/* Learned Knowledge Section - Sub-tab */}
                            {activeMemoryTab === 'knowledge' && (
                                <div className="mt-0 pt-0">
                                    <div className="mb-6">
                                        <h3 className="text-xl font-semibold text-[var(--hg-text-primary)] mb-2">Learned Knowledge</h3>
                                        <p className="text-[var(--hg-text-secondary)]">Explore and manage the knowledge graph and learned patterns.</p>
                                    </div>

                                    {projects.length === 0 ? (
                                        <div className="text-center p-8 border border-dashed border-[var(--hg-border)]">
                                            <p className="text-[var(--hg-text-tertiary)] mb-1">No projects found</p>
                                            <p className="text-sm text-[var(--hg-text-tertiary)]">Create a project to start learning patterns.</p>
                                        </div>
                                    ) : (
                                        <div className="max-w-6xl">
                                            {/* Project Selector */}
                                            <div className="mb-6 flex items-center gap-4">
                                                <label className="text-sm text-[var(--hg-text-secondary)]">Select Project:</label>
                                                <select
                                                    value={selectedProjectId || ''}
                                                    onChange={(e) => setSelectedProjectId(e.target.value)}
                                                    className="bg-[var(--hg-bg)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-primary)] min-w-[200px] outline-none"
                                                >
                                                    <option value="">Select a project...</option>
                                                    {projects.map(p => (
                                                        <option key={p.id} value={p.id}>{p.name}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Learning Dashboard */}
                                            {selectedProjectId && (
                                                <KnowledgeGateway
                                                    projectId={selectedProjectId}
                                                    projectName={projects.find(p => p.id === selectedProjectId)?.name}
                                                    isPro={false}
                                                />
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>)}
                    </>
                )}


                {/* Help Tab */}
                {
                    activeTab === 'help' && (
                        <>
                            <div className="mb-8">
                                <h2 className="text-2xl font-semibold">Resources & Support</h2>
                                <p className="text-[var(--hg-text-secondary)] mt-1">Everything you need to master ChorumAI.</p>
                            </div>

                            <div className="space-y-6 max-w-4xl">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Documentation Card */}
                                    <a
                                        href="https://docs.chorumai.com"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="bg-[var(--hg-surface)] border border-[var(--hg-border)] p-6 hover:border-[var(--hg-border-subtle)] transition-colors group"
                                    >
                                        <h3 className="text-lg font-medium text-[var(--hg-text-primary)] mb-4">
                                            Documentation
                                        </h3>
                                        <p className="text-sm text-[var(--hg-text-secondary)] mb-3">
                                            Comprehensive guides, API references, tutorials, and best practices.
                                        </p>
                                        <div className="inline-flex items-center gap-2 text-sm text-[var(--hg-accent)]">
                                            Visit docs.chorumai.com
                                            <ExternalLink className="w-3 h-3" />
                                        </div>
                                    </a>

                                    {/* Quick Reference Card */}
                                    <section className="bg-[var(--hg-surface)] border border-[var(--hg-border)] p-6 hover:border-[var(--hg-border-subtle)] transition-colors">
                                        <h3 className="text-lg font-medium text-[var(--hg-text-primary)] mb-4">
                                            Quick Reference
                                        </h3>
                                        <div className="space-y-3 text-sm text-[var(--hg-text-secondary)]">
                                            <a href="https://docs.chorumai.com/projects/overview" target="_blank" rel="noopener noreferrer" className="block hover:bg-[var(--hg-surface-hover)] p-2 -m-2 transition-colors group">
                                                <p className="font-medium text-[var(--hg-text-primary)] mb-1">Projects</p>
                                                <p className="text-[var(--hg-text-tertiary)]">Organize conversations by project. Switch using the sidebar.</p>
                                            </a>
                                            <a href="https://docs.chorumai.com/settings/api-keys" target="_blank" rel="noopener noreferrer" className="block hover:bg-[var(--hg-surface-hover)] p-2 -m-2 transition-colors group">
                                                <p className="font-medium text-[var(--hg-text-primary)] mb-1">Intelligent Routing</p>
                                                <p className="text-[var(--hg-text-tertiary)]">ChorumAI auto-selects the best model for your task.</p>
                                            </a>
                                            <a href="https://docs.chorumai.com/settings/budgets" target="_blank" rel="noopener noreferrer" className="block hover:bg-[var(--hg-surface-hover)] p-2 -m-2 transition-colors group">
                                                <p className="font-medium text-[var(--hg-text-primary)] mb-1">Cost Tracking</p>
                                                <p className="text-[var(--hg-text-tertiary)]">Monitor usage in real-time via the top bar.</p>
                                            </a>
                                        </div>
                                    </section>

                                    {/* H4X0R Terminal Easter Egg */}
                                    <section className="bg-[var(--hg-surface)] border border-[var(--hg-border)] p-6 hover:border-[var(--hg-border-subtle)] transition-colors">
                                        <h3 className="text-lg font-medium text-[var(--hg-text-primary)] mb-4">
                                            H4X0R Terminal
                                        </h3>
                                        <div className="bg-[var(--hg-bg)] border border-[var(--hg-border)] p-4 font-mono text-[10px] leading-tight text-[var(--hg-text-secondary)] mb-3 overflow-x-auto">
                                            <pre>{`██   ██ ██   ██ ██   ██  ██████  ██████  
██   ██ ██   ██  ██ ██  ██  ████ ██   ██ 
███████ ███████   ███   ██ ██ ██ ██████  
██   ██     ██   ██ ██  ████  ██ ██   ██ 
██   ██     ██  ██   ██  ██████  ██   ██`}</pre>
                                        </div>
                                        <a
                                            href="https://github.com/ChorumAI/chorum-ai/tree/main/h4x0r"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 text-sm text-[var(--hg-accent)]"
                                        >
                                            Installation & Usage
                                            <ExternalLink className="w-3 h-3" />
                                        </a>
                                    </section>

                                    {/* Community & Support */}
                                    <section className="bg-[var(--hg-surface)] border border-[var(--hg-border)] p-6 hover:border-[var(--hg-border-subtle)] transition-colors md:col-span-2">
                                        <h3 className="text-lg font-medium text-[var(--hg-text-primary)] mb-4">
                                            Community & Support
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <a
                                                href="https://github.com/ChorumAI/chorum-ai"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-3 p-3 bg-[var(--hg-bg)] border border-[var(--hg-border)] hover:border-[var(--hg-border-subtle)] transition-colors group"
                                            >
                                                <Github className="w-5 h-5 text-[var(--hg-text-tertiary)]" />
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium text-[var(--hg-text-primary)]">GitHub</p>
                                                    <p className="text-xs text-[var(--hg-text-tertiary)]">Source & Issues</p>
                                                </div>
                                                <ExternalLink className="w-4 h-4 text-[var(--hg-text-tertiary)]" />
                                            </a>

                                            <a
                                                href="mailto:youcancallmedaniel@proton.me"
                                                className="flex items-center gap-3 p-3 bg-[var(--hg-bg)] border border-[var(--hg-border)] hover:border-[var(--hg-border-subtle)] transition-colors group"
                                            >
                                                <User className="w-5 h-5 text-[var(--hg-text-tertiary)]" />
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium text-[var(--hg-text-primary)]">Contact Us</p>
                                                    <p className="text-xs text-[var(--hg-text-tertiary)]">Get in touch</p>
                                                </div>
                                                <ExternalLink className="w-4 h-4 text-[var(--hg-text-tertiary)]" />
                                            </a>

                                            <Link
                                                href="/changelog"
                                                className="flex items-center gap-3 p-3 bg-[var(--hg-bg)] border border-[var(--hg-border)] hover:border-[var(--hg-border-subtle)] transition-colors group"
                                            >
                                                <Activity className="w-5 h-5 text-[var(--hg-text-tertiary)]" />
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium text-[var(--hg-text-primary)]">What's New</p>
                                                    <p className="text-xs text-[var(--hg-text-tertiary)]">Changelog</p>
                                                </div>
                                                <ExternalLink className="w-4 h-4 text-[var(--hg-text-tertiary)]" />
                                            </Link>
                                        </div>
                                    </section>
                                </div>
                            </div>
                        </>
                    )
                }



                {/* About Tab */}
                {
                    activeTab === 'about' && (
                        <>
                            {/* Centered About Content */}
                            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center mb-16">
                                <img src="/logo.png" alt="ChorumAI" className="w-48 h-48 object-contain mb-6" />

                                <h1 className="text-4xl font-bold mb-2">ChorumAI</h1>
                                <p className="text-[var(--hg-text-secondary)] text-lg mb-8">Built with intelligence, not just tokens.</p>
                                <p className="text-[var(--hg-text-secondary)] text-lg mb-8">Wanna chat? <a href="mailto:youcancallmedaniel@proton.me">Send an email</a></p>

                                <div className="flex items-center gap-6">
                                    <div className="text-center px-6 py-3 bg-[var(--hg-surface)] border border-[var(--hg-border)]">
                                        <p className="text-xs text-[var(--hg-text-tertiary)] uppercase tracking-wider font-semibold">Version</p>
                                        <p className="text-xl font-mono text-[var(--hg-text-primary)] mt-1">v1.5.0</p>
                                    </div>
                                    <a
                                        href="https://github.com/ChorumAI/chorum-ai"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-3 px-6 py-4 bg-[var(--hg-surface)] border border-[var(--hg-border)] hover:border-[var(--hg-border-subtle)] transition-colors group"
                                    >
                                        <Github className="w-6 h-6 text-[var(--hg-text-primary)]" />
                                        <div className="text-left">
                                            <p className="text-xs text-[var(--hg-text-tertiary)] uppercase tracking-wider font-semibold">Source Code</p>
                                            <p className="font-medium text-[var(--hg-text-primary)]">GitHub Repository</p>
                                        </div>
                                    </a>
                                </div>

                                <p className="mt-12 text-sm text-[var(--hg-text-tertiary)] max-w-sm">
                                    Sovereign data platform for your context.
                                </p>
                            </div>

                            {/* Legal Section moved to About */}
                            <div className="mb-8 pt-8 border-t border-[var(--hg-border)]">
                                <h2 className="text-2xl font-semibold">Legal & Privacy</h2>
                                <p className="text-[var(--hg-text-secondary)] mt-1">Terms of use and privacy policy.</p>
                            </div>

                            <div className="space-y-8 max-w-3xl mx-auto">
                                <section className="bg-[var(--hg-surface)] border border-[var(--hg-border)] p-6">
                                    <h3 className="text-lg font-medium text-[var(--hg-text-primary)] mb-2">Privacy Policy</h3>
                                    <div className="prose prose-invert prose-sm text-[var(--hg-text-secondary)]">
                                        <p className="mb-2"><strong>ChorumAI is a local-first application.</strong> We believe your data belongs to you.</p>
                                        <ul className="list-disc pl-5 space-y-1 text-[var(--hg-text-secondary)]">
                                            <li>Your API keys and messages are stored in your own database (PostgreSQL/Supabase).</li>
                                            <li>We do not have access to your keys, your data, or your conversations.</li>
                                            <li>When you send a message, it is transmitted directly from your server to the LLM provider (Anthropic, OpenAI, etc.).</li>
                                            <li>We do not track your usage or sell your data.</li>
                                        </ul>
                                    </div>
                                </section>

                                <section className="bg-[var(--hg-surface)] border border-[var(--hg-border)] p-6">
                                    <h3 className="text-lg font-medium text-[var(--hg-text-primary)] mb-2">License & Liability</h3>
                                    <div className="prose prose-invert prose-sm text-[var(--hg-text-secondary)] font-mono bg-[var(--hg-bg)] p-4 border border-[var(--hg-border)]">
                                        <p className="mb-4">MIT License</p>
                                        <p className="mb-4">Copyright (c) 2024-2026 ChorumAI Contributors</p>
                                        <p className="mb-4">
                                            Permission is hereby granted, free of charge, to any person obtaining a copy
                                            of this software and associated documentation files (the "Software"), to deal
                                            in the Software without restriction, including without limitation the rights
                                            to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
                                            copies of the Software, and to permit persons to whom the Software is
                                            furnished to do so, subject to the following conditions:
                                        </p>
                                        <p className="mb-4">
                                            The above copyright notice and this permission notice shall be included in all
                                            copies or substantial portions of the Software.
                                        </p>
                                        <p>
                                            THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
                                            IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
                                            FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
                                            AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
                                            LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
                                            OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
                                            SOFTWARE.
                                        </p>
                                    </div>
                                    <p className="mt-4 text-xs text-[var(--hg-text-tertiary)]">
                                        Disclaimer: ChorumAI is an open-source project hosted on GitHub. It is not a registered business entity.
                                        Users are responsible for their own API usage, costs, and content generated by AI models.
                                    </p>
                                </section>
                            </div>
                        </>
                    )
                }
            </div >

            {/* Add Provider Modal */}
            {
                showModal && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-[var(--hg-bg)] border border-[var(--hg-border)] w-full max-w-lg p-6">
                            <h3 className="text-lg font-medium mb-4">Add Provider</h3>
                            <form onSubmit={handleAddProvider} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-2">Provider Type</label>
                                    <select
                                        value={formProvider}
                                        onChange={(e) => {
                                            const newProvider = e.target.value
                                            setFormProvider(newProvider)
                                            // Set default model for this provider
                                            const preset = PROVIDER_PRESETS[newProvider]
                                            if (preset?.models?.[0]) setFormModel(preset.models[0])
                                            // Set default base URL
                                            setFormBaseUrl(preset?.defaultBaseUrl || '')
                                            // Fetch available models for local providers
                                            if (newProvider === 'ollama' || newProvider === 'lmstudio') {
                                                fetchLocalModels(newProvider)
                                            }
                                        }}
                                        className="w-full bg-[var(--hg-surface)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-primary)]"
                                    >
                                        <optgroup label="Cloud Providers">
                                            <option value="anthropic">Anthropic (Claude)</option>
                                            <option value="openai">OpenAI (GPT)</option>
                                            <option value="google">Google (Gemini)</option>
                                            <option value="mistral">Mistral AI</option>
                                            <option value="deepseek">DeepSeek</option>
                                            <option value="perplexity">Perplexity AI</option>
                                            <option value="xai">xAI (Grok)</option>
                                            <option value="glm">GLM-4 (Zhipu AI)</option>
                                        </optgroup>
                                        <optgroup label="Local / Custom">
                                            <option value="ollama">Ollama (Local)</option>
                                            <option value="lmstudio">LM Studio (Local)</option>
                                            <option value="openai-compatible">OpenAI-Compatible API</option>
                                        </optgroup>
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-1">
                                            Model
                                            {fetchingLocalModels && (
                                                <Loader2 className="inline w-3 h-3 ml-1 animate-spin" />
                                            )}
                                        </label>
                                        <select
                                            value={formModel}
                                            onChange={(e) => setFormModel(e.target.value)}
                                            className="w-full bg-[var(--hg-surface)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-primary)]"
                                            disabled={fetchingLocalModels}
                                        >
                                            {/* Show discovered models for local providers */}
                                            {(formProvider === 'ollama' && localModels.ollama.available) ? (
                                                localModels.ollama.models.map(m => (
                                                    <option key={m} value={m}>{m}</option>
                                                ))
                                            ) : (formProvider === 'lmstudio' && localModels.lmstudio.available) ? (
                                                localModels.lmstudio.models.map(m => (
                                                    <option key={m} value={m}>{m}</option>
                                                ))
                                            ) : (
                                                PROVIDER_PRESETS[formProvider]?.models.map(m => (
                                                    <option key={m} value={m}>{m}</option>
                                                ))
                                            )}
                                            <option value="custom">Custom...</option>
                                        </select>
                                        {/* Show error/warning for local providers */}
                                        {formProvider === 'ollama' && !localModels.ollama.available && localModels.ollama.error && (
                                            <p className="text-xs text-[var(--hg-destructive)] mt-1 flex items-center gap-1">
                                                <WifiOff className="w-3 h-3" />
                                                {localModels.ollama.error}
                                            </p>
                                        )}
                                        {formProvider === 'lmstudio' && !localModels.lmstudio.available && localModels.lmstudio.error && (
                                            <p className="text-xs text-[var(--hg-destructive)] mt-1 flex items-center gap-1">
                                                <WifiOff className="w-3 h-3" />
                                                {localModels.lmstudio.error}
                                            </p>
                                        )}
                                        {/* Show success indicator */}
                                        {formProvider === 'ollama' && localModels.ollama.available && (
                                            <p className="text-xs text-[var(--hg-accent)] mt-1 flex items-center gap-1">
                                                <Wifi className="w-3 h-3" />
                                                Connected - {localModels.ollama.models.length} model(s) found
                                            </p>
                                        )}
                                        {formProvider === 'lmstudio' && localModels.lmstudio.available && (
                                            <p className="text-xs text-[var(--hg-accent)] mt-1 flex items-center gap-1">
                                                <Wifi className="w-3 h-3" />
                                                Connected - {localModels.lmstudio.models.length} model(s) found
                                            </p>
                                        )}
                                    </div>
                                    {formModel === 'custom' && (
                                        <div>
                                            <label className="block text-xs font-medium text-[var(--hg-text-secondary)] mb-1">Custom Model ID</label>
                                            <input
                                                type="text"
                                                onChange={e => setFormModel(e.target.value)}
                                                className="w-full bg-[var(--hg-surface)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-primary)]"
                                                placeholder="model-name"
                                            />
                                        </div>
                                    )}
                                </div>

                                {providerNeedsKey(formProvider) && (
                                    <div>
                                        <label className="block text-xs font-medium text-[var(--hg-text-secondary)] mb-1">API Key</label>
                                        <input
                                            type="password"
                                            value={formKey}
                                            onChange={e => setFormKey(e.target.value)}
                                            className="w-full bg-[var(--hg-surface)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-primary)]"
                                            placeholder="sk-..."
                                            required={providerNeedsKey(formProvider)}
                                        />
                                    </div>
                                )}

                                {providerIsLocal(formProvider) && (
                                    <div>
                                        <label className="block text-xs font-medium text-[var(--hg-text-secondary)] mb-1">Base URL</label>
                                        <input
                                            type="text"
                                            value={formBaseUrl}
                                            onChange={e => setFormBaseUrl(e.target.value)}
                                            className="w-full bg-[var(--hg-surface)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-primary)] font-mono text-sm"
                                            placeholder="http://localhost:11434"
                                        />
                                        <p className="text-xs text-[var(--hg-text-tertiary)] mt-1">The endpoint URL for your local server</p>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-4">
                                    {!providerIsLocal(formProvider) && (
                                        <div>
                                            <label className="block text-xs font-medium text-[var(--hg-text-secondary)] mb-1">Daily Budget ($)</label>
                                            <input
                                                type="number"
                                                value={formBudget}
                                                onChange={e => setFormBudget(e.target.value)}
                                                className="w-full bg-[var(--hg-surface)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-primary)]"
                                                min="0"
                                                step="0.01"
                                            />
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-xs font-medium text-[var(--hg-text-secondary)] mb-1">Display Name (optional)</label>
                                        <input
                                            type="text"
                                            value={formDisplayName}
                                            onChange={e => setFormDisplayName(e.target.value)}
                                            className="w-full bg-[var(--hg-surface)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-primary)]"
                                            placeholder="My Custom LLM"
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3 mt-6">
                                    <HyggeButton type="button" onClick={() => { setShowModal(false); resetForm() }} className="text-sm">Cancel</HyggeButton>
                                    <HyggeButton type="submit" variant="accent" className="text-sm">Add Provider</HyggeButton>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Edit Provider Modal */}
            {
                showEditModal && editingProvider && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-[var(--hg-bg)] border border-[var(--hg-border)] w-full max-w-lg p-6">
                            <h3 className="text-lg font-medium mb-4">Edit Provider</h3>
                            <p className="text-sm text-[var(--hg-text-secondary)] mb-4">
                                Editing: <span className="text-[var(--hg-text-primary)] font-medium">{PROVIDER_PRESETS[editingProvider.provider]?.name || editingProvider.provider}</span>
                            </p>
                            <form onSubmit={handleEditProvider} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-[var(--hg-text-secondary)] mb-1">Model</label>
                                    <select
                                        value={formModel}
                                        onChange={(e) => setFormModel(e.target.value)}
                                        className="w-full bg-[var(--hg-surface)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-primary)]"
                                    >
                                        {PROVIDER_PRESETS[editingProvider.provider]?.models.map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                        <option value={formModel}>{formModel}</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-[var(--hg-text-secondary)] mb-1">API Key</label>
                                    <div className="w-full bg-[var(--hg-surface)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-tertiary)] font-mono text-sm">
                                        ••••••••••••••••
                                    </div>
                                    <p className="text-xs text-[var(--hg-text-tertiary)] mt-1">To change the API key, delete this provider and create a new one.</p>
                                </div>

                                {editingProvider.isLocal && (
                                    <div>
                                        <label className="block text-xs font-medium text-[var(--hg-text-secondary)] mb-1">Base URL</label>
                                        <input
                                            type="text"
                                            value={formBaseUrl}
                                            onChange={e => setFormBaseUrl(e.target.value)}
                                            className="w-full bg-[var(--hg-surface)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-primary)] font-mono text-sm"
                                            placeholder="http://localhost:11434"
                                        />
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-4">
                                    {!editingProvider.isLocal && (
                                        <div>
                                            <label className="block text-xs font-medium text-[var(--hg-text-secondary)] mb-1">Daily Budget ($)</label>
                                            <input
                                                type="number"
                                                value={formBudget}
                                                onChange={e => setFormBudget(e.target.value)}
                                                className="w-full bg-[var(--hg-surface)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-primary)]"
                                                min="0"
                                                step="0.01"
                                            />
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-xs font-medium text-[var(--hg-text-secondary)] mb-1">Display Name</label>
                                        <input
                                            type="text"
                                            value={formDisplayName}
                                            onChange={e => setFormDisplayName(e.target.value)}
                                            className="w-full bg-[var(--hg-surface)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-primary)]"
                                            placeholder="My Custom LLM"
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3 mt-6">
                                    <HyggeButton type="button" onClick={() => { setShowEditModal(false); setEditingProvider(null); resetForm() }} className="text-sm">Cancel</HyggeButton>
                                    <HyggeButton type="submit" variant="accent" className="text-sm">Save Changes</HyggeButton>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </div >
    )
}

export default function SettingsPage() {
    return (
        <Suspense fallback={<div className="h-screen bg-gray-950 flex items-center justify-center text-gray-500">Loading settings...</div>}>
            <SettingsContent />
        </Suspense>
    )
}
