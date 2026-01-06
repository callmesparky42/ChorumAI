'use client'
import { useState, useEffect, Suspense } from 'react'
import { Plus, Trash2, Shield, Activity, DollarSign, Loader2, User, Lock, Server, Info, FileText, HelpCircle, ExternalLink, Github, Pencil, Wifi, WifiOff, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import clsx from 'clsx'
import { useRouter, useSearchParams } from 'next/navigation'

// Provider presets for the UI
const PROVIDER_PRESETS: Record<string, { name: string, models: string[], requiresKey: boolean, isLocal: boolean, defaultBaseUrl?: string }> = {
    anthropic: { name: 'Anthropic (Claude)', models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20240620', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'], requiresKey: true, isLocal: false },
    openai: { name: 'OpenAI (GPT)', models: ['gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'o1-preview'], requiresKey: true, isLocal: false },
    google: { name: 'Google (Gemini)', models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'], requiresKey: true, isLocal: false },
    mistral: { name: 'Mistral AI', models: ['mistral-large-latest', 'mistral-medium-latest', 'codestral-latest'], requiresKey: true, isLocal: false, defaultBaseUrl: 'https://api.mistral.ai/v1' },
    deepseek: { name: 'DeepSeek', models: ['deepseek-chat', 'deepseek-coder'], requiresKey: true, isLocal: false, defaultBaseUrl: 'https://api.deepseek.com/v1' },
    ollama: { name: 'Ollama (Local)', models: ['llama3', 'mistral', 'phi3', 'codellama', 'gemma2'], requiresKey: false, isLocal: true, defaultBaseUrl: 'http://localhost:11434' },
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
}

function SettingsContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    // activeTab from URL or default to 'providers'
    const activeTab = searchParams.get('tab') || 'providers'

    const [providers, setProviders] = useState<Provider[]>([])

    const [userSettings, setUserSettings] = useState<UserSettings | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [showModal, setShowModal] = useState(false)
    const [showEditModal, setShowEditModal] = useState(false)
    const [editingProvider, setEditingProvider] = useState<Provider | null>(null)

    // Form - Provider (for add)
    const [formProvider, setFormProvider] = useState('anthropic')
    const [formModel, setFormModel] = useState('claude-sonnet-4-20250514')
    const [formKey, setFormKey] = useState('')
    const [formBudget, setFormBudget] = useState('10')
    const [formBaseUrl, setFormBaseUrl] = useState('')
    const [formDisplayName, setFormDisplayName] = useState('')

    // Helper to check if provider needs API key
    const providerNeedsKey = (provider: string) => PROVIDER_PRESETS[provider]?.requiresKey ?? true
    const providerIsLocal = (provider: string) => PROVIDER_PRESETS[provider]?.isLocal ?? false

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
        const params = new URLSearchParams(searchParams)
        params.set('tab', tab)
        router.push(`/settings?${params.toString()}`)
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
        { id: 'resilience', label: 'Resilience', icon: RefreshCw },
        { id: 'help', label: 'Help', icon: HelpCircle },
        { id: 'legal', label: 'Legal & Privacy', icon: FileText },
        { id: 'about', label: 'About', icon: Info },
    ]

    return (
        <div className="flex h-screen bg-gray-950 text-white">
            <div className="hidden md:block">
                <div className="w-64 h-full bg-gray-950 border-r border-gray-800 p-4">
                    <Link href="/" className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6">
                        ← Back to Chat
                    </Link>
                    <h1 className="text-xl font-bold mb-4">Settings</h1>
                    <div className="space-y-1">
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
                                            <p className="text-sm text-gray-500">Reject any non-secure provider endpoints or image sources.</p>
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
                                            <p className="text-sm text-gray-500">Attempt to detect and strip personally identifiable information (emails, phone numbers) before sending prompts.</p>
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
                                            <p className="text-sm text-gray-500">Disable ability to bypass SSL certificate errors (self-signed certs will fail).</p>
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
                                            <p className="text-sm text-gray-500">Log every request and response to local secure storage for compliance auditing.</p>
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
                            <div className="w-24 h-24 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-2xl shadow-blue-900/20">
                                <span className="text-4xl font-bold">C</span>
                            </div>

                            <h1 className="text-4xl font-bold mb-2">ChorumAI</h1>
                            <p className="text-gray-400 text-lg mb-8">Built with intelligence, not just tokens.</p>

                            <div className="flex items-center gap-6">
                                <div className="text-center px-6 py-3 bg-gray-900 rounded-xl border border-gray-800">
                                    <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Version</p>
                                    <p className="text-xl font-mono text-white mt-1">v0.1.0</p>
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
                                ChorumAI is an open-source initiative to build a better, more intelligent interface for LLMs.
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
                                    }}
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
                                >
                                    <optgroup label="Cloud Providers">
                                        <option value="anthropic">Anthropic (Claude)</option>
                                        <option value="openai">OpenAI (GPT)</option>
                                        <option value="google">Google (Gemini)</option>
                                        <option value="mistral">Mistral AI</option>
                                        <option value="deepseek">DeepSeek</option>
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
                                    <label className="block text-xs font-medium text-gray-400 mb-1">Model</label>
                                    <select
                                        value={formModel}
                                        onChange={(e) => setFormModel(e.target.value)}
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
                                    >
                                        {PROVIDER_PRESETS[formProvider]?.models.map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                        <option value="custom">Custom...</option>
                                    </select>
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
