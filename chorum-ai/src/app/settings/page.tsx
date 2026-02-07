'use client'
import { useState, useEffect, Suspense } from 'react'
import { Plus, Trash2, Shield, Activity, DollarSign, Loader2, User, Lock, Server, Info, FileText, HelpCircle, ExternalLink, Github, Pencil, Wifi, WifiOff, RefreshCw, Download, Brain, Zap, Sparkles, FolderOpen, Terminal, LogOut } from 'lucide-react'
import { LearningDashboard } from '@/components/LearningDashboard'
import { McpSettings } from '@/components/settings/McpSettings'
import { McpServersSettings } from '@/components/settings/McpServersSettings'
import { PendingLearnings } from '@/components/PendingLearnings'
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
}

function SettingsContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    // activeTab from URL or default to 'providers'
    const activeTab = searchParams.get('tab') || 'providers'

    const [providers, setProviders] = useState<Provider[]>([])
    const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

    const [userSettings, setUserSettings] = useState<UserSettings | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [showModal, setShowModal] = useState(false)
    const [showEditModal, setShowEditModal] = useState(false)
    const [editingProvider, setEditingProvider] = useState<Provider | null>(null)
    const [memorySubTab, setMemorySubTab] = useState<'settings' | 'knowledge'>('settings')

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
        { id: 'providers', label: 'Providers', icon: Server },
        { id: 'general', label: 'General', icon: User },
        { id: 'security', label: 'Security', icon: Lock },
        { id: 'memory', label: 'Memory & Learning', icon: Brain },
        { id: 'mcp', label: 'MCP Integration', icon: Terminal },
        { id: 'mcp-servers', label: 'MCP Servers', icon: Server },
        { id: 'resilience', label: 'Resilience', icon: RefreshCw },
        { id: 'help', label: 'Help', icon: HelpCircle },
        { id: 'legal', label: 'Legal & Privacy', icon: FileText },
        { id: 'about', label: 'About', icon: Info },
    ]

    return (
        <div className="flex h-screen bg-gray-950 text-white">
            <div className="hidden md:block">
                <div className="w-64 h-full bg-gray-950 border-r border-gray-800 p-4">
                    <Link href="/app" className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6">
                        ← Back to Chat
                    </Link>
                    <h1 className="text-xl font-bold mb-4">Settings</h1>
                    <div className="space-y-1 flex-1">
                        {menuItems.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => handleTabChange(item.id)}
                                className={clsx(
                                    "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3",
                                    activeTab === item.id
                                        ? "bg-blue-600/10 text-blue-400"
                                        : "text-gray-400 hover:bg-gray-900 hover:text-gray-200"
                                )}
                            >
                                <item.icon className="w-4 h-4" />
                                {item.label}
                            </button>
                        ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-800">
                        <button
                            onClick={handleLogout}
                            className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 text-red-400 hover:bg-red-600/10 hover:text-red-300"
                        >
                            <LogOut className="w-4 h-4" />
                            Log Out
                        </button>
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
                                <p className="text-gray-400 mt-1">Configure API keys and budgets for the Routing Engine.</p>
                            </div>
                            <button
                                onClick={() => setShowModal(true)}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                            >
                                <Plus className="w-4 h-4" /> Add Provider
                            </button>
                        </div>

                        {/* Total Usage Summary */}
                        {!loading && providers.length > 0 && (
                            <div className="bg-blue-600/10 border border-blue-500/20 rounded-xl p-4 mb-6 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-500/20 rounded-lg">
                                        <DollarSign className="w-5 h-5 text-blue-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-400 font-medium">Total Usage Today</p>
                                        <p className="text-2xl font-bold text-white">
                                            ${providers.reduce((acc, p) => acc + (Number(p.spentToday) || 0), 0).toFixed(4)}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm text-gray-400 font-medium">Total Daily Budget</p>
                                    <p className="text-lg font-semibold text-gray-200">
                                        ${providers.reduce((acc, p) => acc + (Number(p.dailyBudget) || 0), 0).toFixed(2)}
                                    </p>
                                </div>
                            </div>
                        )}

                        {loading ? (
                            <div className="flex justify-center p-12"><Loader2 className="animate-spin text-gray-500" /></div>
                        ) : providers.length === 0 ? (
                            <div className="text-center p-12 border border-dashed border-gray-800 rounded-xl">
                                <p className="text-gray-500">No active providers configured.</p>
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {providers.map(p => (
                                    <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-start justify-between">
                                        <div className="flex gap-4">
                                            <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center border border-gray-700">
                                                {p.isLocal ? <WifiOff className="w-5 h-5 text-green-400" /> : <Wifi className="w-5 h-5 text-blue-400" />}
                                            </div>
                                            <div>
                                                <h3 className="font-medium flex items-center gap-2">
                                                    {p.displayName || PROVIDER_PRESETS[p.provider]?.name || p.provider}
                                                    <span className="text-xs px-2 py-0.5 bg-gray-800 rounded-full text-gray-400 font-mono">{p.model}</span>
                                                    {p.isLocal && <span className="text-xs px-2 py-0.5 bg-green-900/50 rounded-full text-green-400">Local</span>}
                                                </h3>
                                                <div className="flex items-center gap-6 mt-2 text-sm text-gray-400">
                                                    <span className="flex items-center gap-1.5">
                                                        <Activity className="w-3.5 h-3.5" />
                                                        Today: ${Number(p.spentToday || 0).toFixed(4)}
                                                    </span>
                                                    <span className="flex items-center gap-1.5">
                                                        <DollarSign className="w-3.5 h-3.5" />
                                                        Budget: ${Number(p.dailyBudget).toFixed(2)}
                                                    </span>
                                                    {p.baseUrl && (
                                                        <span className="text-xs text-gray-500 font-mono truncate max-w-[200px]" title={p.baseUrl}>
                                                            {p.baseUrl}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => openEditModal(p)}
                                                className="p-2 text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
                                                title="Edit provider"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteProvider(p.id)}
                                                className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                                title="Delete provider"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* General Tab */}
                {activeTab === 'general' && (
                    <>
                        <div className="mb-8">
                            <h2 className="text-2xl font-semibold">General Settings</h2>
                            <p className="text-gray-400 mt-1">Manage your profile and personal context.</p>
                        </div>

                        {loading ? (
                            <div className="flex justify-center p-12"><Loader2 className="animate-spin text-gray-500" /></div>
                        ) : !userSettings ? (
                            <div className="text-red-400">Failed to load settings.</div>
                        ) : (
                            <form onSubmit={handleUpdateSettings} className="space-y-6 max-w-2xl bg-gray-900/50 p-6 rounded-xl border border-gray-800">
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2">Display Name</label>
                                        <input
                                            type="text"
                                            value={userSettings.name || ''}
                                            onChange={e => setUserSettings({ ...userSettings, name: e.target.value })}
                                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2">Email</label>
                                        <input
                                            type="email"
                                            value={userSettings.email || ''}
                                            onChange={e => setUserSettings({ ...userSettings, email: e.target.value })}
                                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Personal Profile / Bio</label>
                                    <p className="text-xs text-gray-500 mb-3">
                                        Information about you that helps LLMs personalize their responses (e.g., "Software Engineer focused on React", "Prefer concise answers").
                                    </p>
                                    <textarea
                                        value={userSettings.bio || ''}
                                        onChange={e => setUserSettings({ ...userSettings, bio: e.target.value })}
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 min-h-[120px]"
                                    />
                                </div>

                                <div className="pt-4 flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                                    >
                                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                        Save Changes
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* UI Preferences (Client-side only) */}
                        <div className="mt-8">
                            <h3 className="text-xl font-semibold mb-4">UI Preferences</h3>
                            <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800 space-y-4">
                                <div className="flex items-center justify-between p-4 bg-gray-950 rounded-lg border border-gray-800">
                                    <div className="flex-1 pr-8">
                                        <h4 className="font-medium text-white mb-1">Show Message Costs</h4>
                                        <p className="text-sm text-gray-500">Display the estimated cost (USD) for each AI response in the chat thread.</p>
                                    </div>
                                    <button
                                        onClick={() => updateSettings({ showCost: !settings.showCost })}
                                        className={clsx(
                                            "w-12 h-6 rounded-full transition-colors relative",
                                            settings.showCost ? "bg-green-500" : "bg-gray-700"
                                        )}
                                    >
                                        <span className={clsx("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", settings.showCost ? "left-7" : "left-1")} />
                                    </button>
                                </div>
                            </div>
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
                            <div className="text-red-400">Failed to load settings.</div>
                        ) : (
                            <div className="max-w-2xl bg-gray-900/50 p-6 rounded-xl border border-gray-800 space-y-6">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-4 bg-gray-950 rounded-lg border border-gray-800">
                                        <div className="flex-1 pr-8">
                                            <h3 className="font-medium text-white mb-1">Enforce HTTPS Only</h3>
                                            <p className="text-sm text-gray-500">Require encrypted HTTPS connections for all external API endpoints. Requests to providers using unencrypted HTTP will be blocked to prevent man-in-the-middle attacks and data interception. Localhost connections (for Ollama/LM Studio) are exempt from this restriction.</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const newSettings = { ...userSettings, securitySettings: { ...userSettings.securitySettings, enforceHttps: !userSettings.securitySettings?.enforceHttps } }
                                                setUserSettings(newSettings)
                                                // Auto-save toggle? Or wait for explicit save?
                                                // For settings toggles, explicit save is safer or auto-save debounce.
                                                // Let's rely on explicit save for uniformity or add a useEffect saver.
                                                // For now, let's add a save button at bottom.
                                            }}
                                            className={clsx(
                                                "w-12 h-6 rounded-full transition-colors relative",
                                                userSettings.securitySettings?.enforceHttps ? "bg-green-500" : "bg-gray-700"
                                            )}
                                        >
                                            <span className={clsx("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", userSettings.securitySettings?.enforceHttps ? "left-7" : "left-1")} />
                                        </button>
                                    </div>

                                    <div className="flex items-center justify-between p-4 bg-gray-950 rounded-lg border border-gray-800">
                                        <div className="flex-1 pr-8">
                                            <h3 className="font-medium text-white mb-1">Anonymize PII</h3>
                                            <p className="text-sm text-gray-500">Automatically detect and redact personally identifiable information (emails, phone numbers, SSNs, credit cards) from your prompts before sending to LLM providers. Redacted content is replaced with placeholders like [EMAIL_REDACTED] to preserve context while protecting your privacy. This runs client-side before any data leaves your server.</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const newSettings = { ...userSettings, securitySettings: { ...userSettings.securitySettings, anonymizePii: !userSettings.securitySettings?.anonymizePii } }
                                                setUserSettings(newSettings)
                                            }}
                                            className={clsx(
                                                "w-12 h-6 rounded-full transition-colors relative",
                                                userSettings.securitySettings?.anonymizePii ? "bg-green-500" : "bg-gray-700"
                                            )}
                                        >
                                            <span className={clsx("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", userSettings.securitySettings?.anonymizePii ? "left-7" : "left-1")} />
                                        </button>
                                    </div>

                                    <div className="flex items-center justify-between p-4 bg-gray-950 rounded-lg border border-gray-800">
                                        <div className="flex-1 pr-8">
                                            <h3 className="font-medium text-white mb-1">Strict SSL Verification</h3>
                                            <p className="text-sm text-gray-500">Enforce full SSL/TLS certificate validation for local provider connections (Ollama, LM Studio, custom endpoints). When enabled, self-signed or invalid certificates will cause requests to fail. Disable for enterprise setups with internal CA certificates or development servers using self-signed certs. Cloud providers (OpenAI, Anthropic, etc.) always use strict SSL.</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const newSettings = { ...userSettings, securitySettings: { ...userSettings.securitySettings, strictSsl: !userSettings.securitySettings?.strictSsl } }
                                                setUserSettings(newSettings)
                                            }}
                                            className={clsx(
                                                "w-12 h-6 rounded-full transition-colors relative",
                                                userSettings.securitySettings?.strictSsl ? "bg-green-500" : "bg-gray-700"
                                            )}
                                        >
                                            <span className={clsx("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", userSettings.securitySettings?.strictSsl ? "left-7" : "left-1")} />
                                        </button>
                                    </div>

                                    <div className="flex items-center justify-between p-4 bg-gray-950 rounded-lg border border-gray-800">
                                        <div className="flex-1 pr-8">
                                            <h3 className="font-medium text-white mb-1">Audit Logging</h3>
                                            <p className="text-sm text-gray-500">Record detailed logs of every LLM request including provider, model, timestamp, and security flags for compliance and debugging. Logs include which security features were active and whether PII was detected. This data stays local and is not sent to any external service. Essential for enterprise compliance requirements (SOC2, HIPAA).</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const newSettings = { ...userSettings, securitySettings: { ...userSettings.securitySettings, logAllRequests: !userSettings.securitySettings?.logAllRequests } }
                                                setUserSettings(newSettings)
                                            }}
                                            className={clsx(
                                                "w-12 h-6 rounded-full transition-colors relative",
                                                userSettings.securitySettings?.logAllRequests ? "bg-green-500" : "bg-gray-700"
                                            )}
                                        >
                                            <span className={clsx("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", userSettings.securitySettings?.logAllRequests ? "left-7" : "left-1")} />
                                        </button>
                                    </div>
                                </div>

                                <div className="pt-4 flex justify-between items-center">
                                    <button
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
                                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                                    >
                                        <Download className="w-4 h-4" />
                                        Download Audit Logs
                                    </button>
                                    <button
                                        onClick={(e) => handleUpdateSettings(e)}
                                        disabled={saving}
                                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                                    >
                                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                        Save Changes
                                    </button>
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
                            <p className="text-gray-400 mt-1">Connect external AI agents to your ChorumAI memory.</p>
                        </div>

                        <div className="space-y-8">
                            {/* Pending Learnings Section */}
                            <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800">
                                <PendingLearnings />
                            </div>

                            {/* MCP Settings Section */}
                            <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800">
                                <McpSettings />
                            </div>
                        </div>
                    </>
                )}

                {/* MCP Servers Tab */}
                {activeTab === 'mcp-servers' && (
                    <>
                        <div className="mb-8">
                            <h2 className="text-2xl font-semibold">MCP Servers</h2>
                            <p className="text-gray-400 mt-1">Connect to external MCP servers for tools like web search.</p>
                        </div>

                        <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800">
                            <McpServersSettings />
                        </div>
                    </>
                )}

                {/* Resilience Tab */}
                {activeTab === 'resilience' && (
                    <>
                        <div className="mb-8">
                            <h2 className="text-2xl font-semibold">Resilience & Fallback</h2>
                            <p className="text-gray-400 mt-1">Configure automatic failover when providers are unavailable.</p>
                        </div>

                        {loading ? (
                            <div className="flex justify-center p-12"><Loader2 className="animate-spin text-gray-500" /></div>
                        ) : !userSettings ? (
                            <div className="text-red-400">Failed to load settings.</div>
                        ) : (
                            <div className="max-w-2xl bg-gray-900/50 p-6 rounded-xl border border-gray-800 space-y-6">
                                {/* Master toggle */}
                                <div className="flex items-center justify-between p-4 bg-gray-950 rounded-lg border border-gray-800">
                                    <div className="flex-1 pr-8">
                                        <h3 className="font-medium text-white mb-1">Enable Automatic Fallback</h3>
                                        <p className="text-sm text-gray-500">
                                            When a provider fails (network error, rate limit, auth issue), automatically try other configured providers.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const newSettings = {
                                                ...userSettings,
                                                fallbackSettings: {
                                                    ...userSettings.fallbackSettings,
                                                    enabled: userSettings.fallbackSettings?.enabled === false ? true : !(userSettings.fallbackSettings?.enabled ?? true)
                                                }
                                            }
                                            setUserSettings(newSettings)
                                        }}
                                        className={clsx(
                                            "w-12 h-6 rounded-full transition-colors relative",
                                            (userSettings.fallbackSettings?.enabled ?? true) ? "bg-green-500" : "bg-gray-700"
                                        )}
                                    >
                                        <span className={clsx("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", (userSettings.fallbackSettings?.enabled ?? true) ? "left-7" : "left-1")} />
                                    </button>
                                </div>

                                {/* Default fallback provider */}
                                <div className="p-4 bg-gray-950 rounded-lg border border-gray-800">
                                    <h3 className="font-medium text-white mb-1">Default Fallback Provider</h3>
                                    <p className="text-sm text-gray-500 mb-3">
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
                                        className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-white"
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
                                <div className="p-4 bg-gray-950 rounded-lg border border-gray-800">
                                    <h3 className="font-medium text-white mb-1">Offline Fallback (Local Model)</h3>
                                    <p className="text-sm text-gray-500 mb-3">
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
                                        className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-white font-mono"
                                        placeholder="llama3 (auto-detect if empty)"
                                    />
                                    <p className="text-xs text-gray-600 mt-2">
                                        Common models: llama3, mistral, phi3, codellama, gemma2
                                    </p>
                                </div>

                                {/* Info box */}
                                <div className="p-4 bg-blue-950/30 rounded-lg border border-blue-900/50">
                                    <h4 className="text-sm font-medium text-blue-400 mb-2">How Fallback Works</h4>
                                    <ul className="text-sm text-gray-400 space-y-1 list-disc pl-4">
                                        <li>Primary provider fails → tries alternatives from routing</li>
                                        <li>If you set a default, it becomes first alternative</li>
                                        <li>Network/timeout errors trigger fallback automatically</li>
                                        <li>Auth errors (bad API key) also trigger fallback</li>
                                        <li>Local models (Ollama) are last resort for offline scenarios</li>
                                    </ul>
                                </div>

                                <div className="pt-4 flex justify-end">
                                    <button
                                        onClick={(e) => handleUpdateSettings(e)}
                                        disabled={saving}
                                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                                    >
                                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                        Save Changes
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
                {/* Memory Tab */}
                {activeTab === 'memory' && (
                    <>
                        <div className="mb-8">
                            <h2 className="text-2xl font-semibold">Memory & Learning</h2>
                            <p className="text-gray-400 mt-1">Control how ChorumAI learns from conversations and manages context.</p>

                            {/* Sub-tabs */}
                            <div className="flex gap-1 mt-4 border-b border-gray-800">
                                <button
                                    onClick={() => setMemorySubTab('settings')}
                                    className={clsx(
                                        "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                                        memorySubTab === 'settings'
                                            ? "border-blue-500 text-blue-400"
                                            : "border-transparent text-gray-500 hover:text-gray-300"
                                    )}
                                >
                                    Settings
                                </button>
                                <button
                                    onClick={() => {
                                        setMemorySubTab('knowledge')
                                        // Fetch projects when switching to knowledge tab
                                        if (projects.length === 0) {
                                            fetch('/api/projects').then(res => {
                                                if (res.ok) {
                                                    res.json().then(data => {
                                                        setProjects(data)
                                                        if (data.length > 0 && !selectedProjectId) setSelectedProjectId(data[0].id)
                                                    })
                                                }
                                            })
                                        }
                                    }}
                                    className={clsx(
                                        "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2",
                                        memorySubTab === 'knowledge'
                                            ? "border-purple-500 text-purple-400"
                                            : "border-transparent text-gray-500 hover:text-gray-300"
                                    )}
                                >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    Learned Knowledge
                                </button>
                            </div>
                        </div>

                        {loading ? (
                            <div className="flex justify-center p-12"><Loader2 className="animate-spin text-gray-500" /></div>
                        ) : memorySubTab === 'settings' ? (
                            /* Settings Sub-Tab */
                            !userSettings ? (
                                <div className="text-red-400">Failed to load settings.</div>
                            ) : (
                                <div className="max-w-2xl space-y-6">
                                    {/* Learning & Context Section */}
                                    <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800 space-y-4">
                                        <h3 className="text-lg font-medium flex items-center gap-2">
                                            <Brain className="w-5 h-5 text-purple-400" />
                                            Learning & Context
                                        </h3>

                                        {/* Auto-Learn Toggle */}
                                        <div className="flex items-center justify-between p-4 bg-gray-950 rounded-lg border border-gray-800">
                                            <div className="flex-1 pr-8">
                                                <h4 className="font-medium text-white mb-1">Auto-Learn Patterns</h4>
                                                <p className="text-sm text-gray-500">Extract patterns, decisions, and invariants from conversations for future context.</p>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const newSettings = { ...userSettings, memorySettings: { ...userSettings.memorySettings, autoLearn: !userSettings.memorySettings?.autoLearn } }
                                                    setUserSettings(newSettings)
                                                }}
                                                className={clsx("w-12 h-6 rounded-full transition-colors relative", userSettings.memorySettings?.autoLearn ? "bg-purple-500" : "bg-gray-700")}
                                            >
                                                <span className={clsx("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", userSettings.memorySettings?.autoLearn ? "left-7" : "left-1")} />
                                            </button>
                                        </div>

                                        {/* Learning Mode Selector */}
                                        {userSettings.memorySettings?.autoLearn && (
                                            <div className="flex items-center justify-between p-4 bg-gray-950 rounded-lg border border-gray-800">
                                                <div className="flex-1 pr-8">
                                                    <h4 className="font-medium text-white mb-1">Processing Mode</h4>
                                                    <p className="text-sm text-gray-500">
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
                                                    className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2"
                                                >
                                                    <option value="async">Async (Background)</option>
                                                    <option value="sync">Sync (Immediate)</option>
                                                </select>
                                            </div>
                                        )}

                                        {/* Inject Context Toggle */}
                                        <div className="flex items-center justify-between p-4 bg-gray-950 rounded-lg border border-gray-800">
                                            <div className="flex-1 pr-8">
                                                <h4 className="font-medium text-white mb-1">Inject Learned Context</h4>
                                                <p className="text-sm text-gray-500">Add patterns and invariants to prompts. Adds ~50-100ms latency.</p>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const newSettings = { ...userSettings, memorySettings: { ...userSettings.memorySettings, injectContext: !userSettings.memorySettings?.injectContext } }
                                                    setUserSettings(newSettings)
                                                }}
                                                className={clsx("w-12 h-6 rounded-full transition-colors relative", userSettings.memorySettings?.injectContext !== false ? "bg-purple-500" : "bg-gray-700")}
                                            >
                                                <span className={clsx("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", userSettings.memorySettings?.injectContext !== false ? "left-7" : "left-1")} />
                                            </button>
                                        </div>
                                        {/* Link Analysis */}
                                        <div className="p-4 bg-gray-950 rounded-lg border border-gray-800 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h4 className="font-medium text-white mb-1">Knowledge Graph Analysis</h4>
                                                    <p className="text-sm text-gray-500">
                                                        Analyze co-occurrence data to infer logical relationships (supports, contradicts, supersedes) between memory items.
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <select
                                                    value={linkAnalysisProjectId || ''}
                                                    onChange={(e) => {
                                                        setLinkAnalysisProjectId(e.target.value)
                                                        setLinkAnalysisResult(null)
                                                    }}
                                                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                                                >
                                                    {projects.length === 0 && (
                                                        <option value="">No projects available</option>
                                                    )}
                                                    {projects.map(p => (
                                                        <option key={p.id} value={p.id}>{p.name}</option>
                                                    ))}
                                                </select>
                                                <button
                                                    onClick={async () => {
                                                        if (!linkAnalysisProjectId) return
                                                        setAnalyzingLinks(true)
                                                        setLinkAnalysisResult(null)
                                                        try {
                                                            const res = await fetch('/api/learning/analyze-links', {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ projectId: linkAnalysisProjectId })
                                                            })
                                                            const data = await res.json()
                                                            if (data.success) {
                                                                setLinkAnalysisResult({ success: true, message: data.message })
                                                            } else {
                                                                setLinkAnalysisResult({ success: false, message: data.message || data.error })
                                                            }
                                                        } catch (e: any) {
                                                            setLinkAnalysisResult({ success: false, message: e.message })
                                                        } finally {
                                                            setAnalyzingLinks(false)
                                                        }
                                                    }}
                                                    disabled={analyzingLinks || !linkAnalysisProjectId || projects.length === 0}
                                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-2"
                                                >
                                                    {analyzingLinks ? (
                                                        <>
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                            Analyzing...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Sparkles className="w-4 h-4" />
                                                            Analyze Links
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                            {linkAnalysisResult && (
                                                <p className={clsx("text-sm", linkAnalysisResult.success ? "text-green-400" : "text-yellow-400")}>
                                                    {linkAnalysisResult.message}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Response Processing Section */}
                                    <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800 space-y-4">
                                        <h3 className="text-lg font-medium flex items-center gap-2">
                                            <Activity className="w-5 h-5 text-blue-400" />
                                            Response Processing
                                        </h3>

                                        {/* Auto-Summarize Toggle */}
                                        <div className="flex items-center justify-between p-4 bg-gray-950 rounded-lg border border-gray-800">
                                            <div className="flex-1 pr-8">
                                                <h4 className="font-medium text-white mb-1">Auto-Summarize Conversations</h4>
                                                <p className="text-sm text-gray-500">Compress old messages into summaries for context management. Adds ~800ms latency.</p>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const newSettings = { ...userSettings, memorySettings: { ...userSettings.memorySettings, autoSummarize: !userSettings.memorySettings?.autoSummarize } }
                                                    setUserSettings(newSettings)
                                                }}
                                                className={clsx("w-12 h-6 rounded-full transition-colors relative", userSettings.memorySettings?.autoSummarize !== false ? "bg-blue-500" : "bg-gray-700")}
                                            >
                                                <span className={clsx("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", userSettings.memorySettings?.autoSummarize !== false ? "left-7" : "left-1")} />
                                            </button>
                                        </div>

                                        {/* Manual Summarize - shown when auto-summarize is OFF */}
                                        {userSettings.memorySettings?.autoSummarize === false && (
                                            <div className="p-4 bg-gray-950 rounded-lg border border-gray-800 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h4 className="font-medium text-white mb-1">Manual Summarization</h4>
                                                        <p className="text-sm text-gray-500">Manually trigger summarization for a project when needed.</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <select
                                                        value={summarizeProjectId || ''}
                                                        onChange={(e) => {
                                                            setSummarizeProjectId(e.target.value)
                                                            setSummarizeResult(null)
                                                        }}
                                                        className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                                                    >
                                                        {projects.length === 0 && (
                                                            <option value="">No projects available</option>
                                                        )}
                                                        {projects.map(p => (
                                                            <option key={p.id} value={p.id}>{p.name}</option>
                                                        ))}
                                                    </select>
                                                    <button
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
                                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-2"
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
                                                    </button>
                                                </div>
                                                {summarizeResult && (
                                                    <p className={clsx("text-sm", summarizeResult.success ? "text-green-400" : "text-yellow-400")}>
                                                        {summarizeResult.message}
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        {/* Validate Responses Toggle */}
                                        <div className="flex items-center justify-between p-4 bg-gray-950 rounded-lg border border-gray-800">
                                            <div className="flex-1 pr-8">
                                                <h4 className="font-medium text-white mb-1">Validate Against Invariants</h4>
                                                <p className="text-sm text-gray-500">Check responses for rule violations. Adds ~100-200ms latency.</p>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const newSettings = { ...userSettings, memorySettings: { ...userSettings.memorySettings, validateResponses: !userSettings.memorySettings?.validateResponses } }
                                                    setUserSettings(newSettings)
                                                }}
                                                className={clsx("w-12 h-6 rounded-full transition-colors relative", userSettings.memorySettings?.validateResponses !== false ? "bg-blue-500" : "bg-gray-700")}
                                            >
                                                <span className={clsx("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", userSettings.memorySettings?.validateResponses !== false ? "left-7" : "left-1")} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Agent Selection Section */}
                                    <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800 space-y-4">
                                        <h3 className="text-lg font-medium flex items-center gap-2">
                                            🤖 Agent Selection
                                        </h3>

                                        {/* Smart Agent Routing Toggle */}
                                        <div className="flex items-center justify-between p-4 bg-gray-950 rounded-lg border border-gray-800">
                                            <div className="flex-1 pr-8">
                                                <h4 className="font-medium text-white mb-1">Smart Agent Routing</h4>
                                                <p className="text-sm text-gray-500">Auto-select the best agent for each message. Adds ~20-50ms latency. When OFF, uses manually selected agent only.</p>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const newSettings = { ...userSettings, memorySettings: { ...userSettings.memorySettings, smartAgentRouting: !userSettings.memorySettings?.smartAgentRouting } }
                                                    setUserSettings(newSettings)
                                                }}
                                                className={clsx("w-12 h-6 rounded-full transition-colors relative", userSettings.memorySettings?.smartAgentRouting !== false ? "bg-green-500" : "bg-gray-700")}
                                            >
                                                <span className={clsx("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", userSettings.memorySettings?.smartAgentRouting !== false ? "left-7" : "left-1")} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Performance Mode Section */}
                                    <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="text-lg font-medium flex items-center gap-2">
                                                    <Zap className="w-5 h-5 text-yellow-400" />
                                                    Minimal Latency Mode
                                                </h3>
                                                <p className="text-sm text-gray-500 mt-1">Disables all background processing for fastest response times.</p>
                                            </div>
                                            <button
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
                                                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                                            >
                                                <Zap className="w-4 h-4" />
                                                Enable Minimal Mode
                                            </button>
                                        </div>
                                    </div>

                                    {/* Save Button */}
                                    <div className="pt-4 flex justify-end">
                                        <button
                                            onClick={(e) => handleUpdateSettings(e)}
                                            disabled={saving}
                                            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                                        >
                                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                            Save Changes
                                        </button>
                                    </div>
                                </div>
                            )
                        ) : (
                            /* Knowledge Sub-Tab */
                            projects.length === 0 ? (
                                <div className="text-center p-12 border border-dashed border-gray-800 rounded-xl">
                                    <FolderOpen className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                                    <p className="text-gray-500 mb-2">No projects found</p>
                                    <p className="text-sm text-gray-600">Create a project to start learning patterns from your conversations.</p>
                                </div>
                            ) : (
                                <div className="max-w-4xl">
                                    {/* Project Selector */}
                                    <div className="mb-6 flex items-center gap-4">
                                        <label className="text-sm text-gray-400">Project:</label>
                                        <select
                                            value={selectedProjectId || ''}
                                            onChange={(e) => setSelectedProjectId(e.target.value)}
                                            className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-white min-w-[200px]"
                                        >
                                            {projects.map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Learning Dashboard */}
                                    {selectedProjectId && (
                                        <LearningDashboard
                                            projectId={selectedProjectId}
                                            projectName={projects.find(p => p.id === selectedProjectId)?.name}
                                        />
                                    )}
                                </div>
                            )
                        )}
                    </>
                )}


                {/* Help Tab */}
                {activeTab === 'help' && (
                    <>
                        <div className="mb-8">
                            <h2 className="text-2xl font-semibold">Help & Documentation</h2>
                            <p className="text-gray-400 mt-1">Getting started with ChorumAI.</p>
                        </div>

                        <div className="space-y-8 max-w-3xl">
                            <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                                <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                                    <Server className="w-5 h-5 text-blue-400" />
                                    Onboarding LLMs
                                </h3>
                                <div className="space-y-4 text-sm text-gray-300">
                                    <p>
                                        To use ChorumAI, you need to provide API keys. We support the major AI providers directly.
                                        You can get your keys from their respective developer consoles:
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                        <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer"
                                            className="flex items-center justify-between p-3 bg-gray-950 border border-gray-800 rounded-lg hover:border-gray-700 transition-colors group">
                                            <span>Anthropic Console</span>
                                            <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-blue-400" />
                                        </a>
                                        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer"
                                            className="flex items-center justify-between p-3 bg-gray-950 border border-gray-800 rounded-lg hover:border-gray-700 transition-colors group">
                                            <span>OpenAI Platform</span>
                                            <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-blue-400" />
                                        </a>
                                        <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer"
                                            className="flex items-center justify-between p-3 bg-gray-950 border border-gray-800 rounded-lg hover:border-gray-700 transition-colors group">
                                            <span>Google AI Studio</span>
                                            <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-blue-400" />
                                        </a>
                                        <a href="https://console.mistral.ai/" target="_blank" rel="noopener noreferrer"
                                            className="flex items-center justify-between p-3 bg-gray-950 border border-gray-800 rounded-lg hover:border-gray-700 transition-colors group">
                                            <span>Mistral AI Console</span>
                                            <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-blue-400" />
                                        </a>
                                    </div>
                                    <p className="mt-4 text-gray-400">
                                        Once you have a key, go to the <strong>Providers</strong> tab to add it. You can set a daily budget for each key to control costs.
                                    </p>
                                </div>
                            </section>

                            <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                                <h3 className="text-lg font-medium text-white mb-4">Projects & Chat</h3>
                                <div className="space-y-3 text-sm text-gray-300">
                                    <p>
                                        <strong>Projects:</strong> All conversations are organized into projects. The sidebar on the left allows you to create new projects or switch between them.
                                    </p>
                                    <p>
                                        <strong>Intelligent Routing:</strong> ChorumAI automatically selects the best model for your task. For example, it might use Claude 3.5 Sonnet for coding and Gemini 1.5 Pro for large context analysis.
                                    </p>
                                    <p>
                                        <strong>Cost Meter:</strong> The top bar shows your session usage. Detailed logs are available in the Dashboard or Database.
                                    </p>
                                </div>
                            </section>
                        </div>
                    </>
                )}

                {/* Legal Tab */}
                {activeTab === 'legal' && (
                    <>
                        <div className="mb-8">
                            <h2 className="text-2xl font-semibold">Legal & Privacy</h2>
                            <p className="text-gray-400 mt-1">Terms of use and privacy policy.</p>
                        </div>

                        <div className="space-y-8 max-w-3xl">
                            <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                                <h3 className="text-lg font-medium text-white mb-2">Privacy Policy</h3>
                                <div className="prose prose-invert prose-sm text-gray-300">
                                    <p className="mb-2"><strong>ChorumAI is a local-first application.</strong> We believe your data belongs to you.</p>
                                    <ul className="list-disc pl-5 space-y-1 text-gray-400">
                                        <li>Your API keys and messages are stored in your own database (PostgreSQL/Supabase).</li>
                                        <li>We do not have access to your keys, your data, or your conversations.</li>
                                        <li>When you send a message, it is transmitted directly from your server to the LLM provider (Anthropic, OpenAI, etc.).</li>
                                        <li>We do not track your usage or sell your data.</li>
                                    </ul>
                                </div>
                            </section>

                            <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                                <h3 className="text-lg font-medium text-white mb-2">License & Liability</h3>
                                <div className="prose prose-invert prose-sm text-gray-300 font-mono bg-black/20 p-4 rounded-lg border border-gray-800">
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
                                <p className="mt-4 text-xs text-gray-500">
                                    Disclaimer: ChorumAI is an open-source project hosted on GitHub. It is not a registered business entity.
                                    Users are responsible for their own API usage, costs, and content generated by AI models.
                                </p>
                            </section>
                        </div>
                    </>
                )}

                {/* About Tab */}
                {activeTab === 'about' && (
                    <>
                        {/* Centered About Content */}
                        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
                            <img src="/logo.png" alt="ChorumAI" className="w-48 h-48 object-contain mb-6" />

                            <h1 className="text-4xl font-bold mb-2">ChorumAI</h1>
                            <p className="text-gray-400 text-lg mb-8">Built with intelligence, not just tokens.</p>
                            <p className="text-gray-400 text-lg mb-8">Wanna chat? youcancallmedaniel@proton.me</p>

                            <div className="flex items-center gap-6">
                                <div className="text-center px-6 py-3 bg-gray-900 rounded-xl border border-gray-800">
                                    <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Version</p>
                                    <p className="text-xl font-mono text-white mt-1">v1.1.3</p>
                                </div>
                                <a
                                    href="https://github.com/ChorumAI/chorum-ai"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-3 px-6 py-4 bg-gray-900 hover:bg-gray-800 rounded-xl border border-gray-800 hover:border-gray-700 transition-all group"
                                >
                                    <Github className="w-6 h-6 text-white" />
                                    <div className="text-left">
                                        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold group-hover:text-blue-400 transition-colors">Source Code</p>
                                        <p className="font-medium text-white">GitHub Repository</p>
                                    </div>
                                </a>
                            </div>

                            <p className="mt-12 text-sm text-gray-600 max-w-sm">
                                ChorumAI — Sovereign data platform for your context.
                            </p>
                        </div>
                    </>
                )}
            </div>

            {/* Add Provider Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg p-6 shadow-2xl">
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
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
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
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
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
                                        <p className="text-xs text-amber-500 mt-1 flex items-center gap-1">
                                            <WifiOff className="w-3 h-3" />
                                            {localModels.ollama.error}
                                        </p>
                                    )}
                                    {formProvider === 'lmstudio' && !localModels.lmstudio.available && localModels.lmstudio.error && (
                                        <p className="text-xs text-amber-500 mt-1 flex items-center gap-1">
                                            <WifiOff className="w-3 h-3" />
                                            {localModels.lmstudio.error}
                                        </p>
                                    )}
                                    {/* Show success indicator */}
                                    {formProvider === 'ollama' && localModels.ollama.available && (
                                        <p className="text-xs text-green-500 mt-1 flex items-center gap-1">
                                            <Wifi className="w-3 h-3" />
                                            Connected - {localModels.ollama.models.length} model(s) found
                                        </p>
                                    )}
                                    {formProvider === 'lmstudio' && localModels.lmstudio.available && (
                                        <p className="text-xs text-green-500 mt-1 flex items-center gap-1">
                                            <Wifi className="w-3 h-3" />
                                            Connected - {localModels.lmstudio.models.length} model(s) found
                                        </p>
                                    )}
                                </div>
                                {formModel === 'custom' && (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-1">Custom Model ID</label>
                                        <input
                                            type="text"
                                            onChange={e => setFormModel(e.target.value)}
                                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
                                            placeholder="model-name"
                                        />
                                    </div>
                                )}
                            </div>

                            {providerNeedsKey(formProvider) && (
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">API Key</label>
                                    <input
                                        type="password"
                                        value={formKey}
                                        onChange={e => setFormKey(e.target.value)}
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
                                        placeholder="sk-..."
                                        required={providerNeedsKey(formProvider)}
                                    />
                                </div>
                            )}

                            {providerIsLocal(formProvider) && (
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">Base URL</label>
                                    <input
                                        type="text"
                                        value={formBaseUrl}
                                        onChange={e => setFormBaseUrl(e.target.value)}
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white font-mono text-sm"
                                        placeholder="http://localhost:11434"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">The endpoint URL for your local server</p>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                {!providerIsLocal(formProvider) && (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-1">Daily Budget ($)</label>
                                        <input
                                            type="number"
                                            value={formBudget}
                                            onChange={e => setFormBudget(e.target.value)}
                                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
                                            min="0"
                                            step="0.01"
                                        />
                                    </div>
                                )}
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">Display Name (optional)</label>
                                    <input
                                        type="text"
                                        value={formDisplayName}
                                        onChange={e => setFormDisplayName(e.target.value)}
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
                                        placeholder="My Custom LLM"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" onClick={() => { setShowModal(false); resetForm() }} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium text-white">Add Provider</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Provider Modal */}
            {showEditModal && editingProvider && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg p-6 shadow-2xl">
                        <h3 className="text-lg font-medium mb-4">Edit Provider</h3>
                        <p className="text-sm text-gray-400 mb-4">
                            Editing: <span className="text-white font-medium">{PROVIDER_PRESETS[editingProvider.provider]?.name || editingProvider.provider}</span>
                        </p>
                        <form onSubmit={handleEditProvider} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">Model</label>
                                <select
                                    value={formModel}
                                    onChange={(e) => setFormModel(e.target.value)}
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
                                >
                                    {PROVIDER_PRESETS[editingProvider.provider]?.models.map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                    <option value={formModel}>{formModel}</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">API Key</label>
                                <div className="w-full bg-gray-950/50 border border-gray-800 rounded-lg px-3 py-2 text-gray-500 font-mono text-sm">
                                    ••••••••••••••••
                                </div>
                                <p className="text-xs text-gray-500 mt-1">To change the API key, delete this provider and create a new one.</p>
                            </div>

                            {editingProvider.isLocal && (
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">Base URL</label>
                                    <input
                                        type="text"
                                        value={formBaseUrl}
                                        onChange={e => setFormBaseUrl(e.target.value)}
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white font-mono text-sm"
                                        placeholder="http://localhost:11434"
                                    />
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                {!editingProvider.isLocal && (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-1">Daily Budget ($)</label>
                                        <input
                                            type="number"
                                            value={formBudget}
                                            onChange={e => setFormBudget(e.target.value)}
                                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
                                            min="0"
                                            step="0.01"
                                        />
                                    </div>
                                )}
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">Display Name</label>
                                    <input
                                        type="text"
                                        value={formDisplayName}
                                        onChange={e => setFormDisplayName(e.target.value)}
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
                                        placeholder="My Custom LLM"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" onClick={() => { setShowEditModal(false); setEditingProvider(null); resetForm() }} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium text-white">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

export default function SettingsPage() {
    return (
        <Suspense fallback={<div className="h-screen bg-gray-950 flex items-center justify-center text-gray-500">Loading settings...</div>}>
            <SettingsContent />
        </Suspense>
    )
}
