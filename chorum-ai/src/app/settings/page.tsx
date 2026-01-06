'use client'
import { useState, useEffect, Suspense } from 'react'
import { Plus, Trash2, Shield, Activity, DollarSign, Loader2, User, Lock, Server } from 'lucide-react'
import Link from 'next/link'
import clsx from 'clsx'
import { useRouter, useSearchParams } from 'next/navigation'

// ... interfaces remain ...
interface Provider {
    id: string
    provider: string
    model: string
    dailyBudget: string
    spentToday?: number
    isActive: boolean
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

    // Form - Provider
    const [formProvider, setFormProvider] = useState('anthropic')
    const [formModel, setFormModel] = useState('claude-3-5-sonnet-20240620')
    const [formKey, setFormKey] = useState('')
    const [formBudget, setFormBudget] = useState('10')

    useEffect(() => {
        fetchData()
    }, [activeTab])

    const fetchData = async () => {
        setLoading(true)
        try {
            if (activeTab === 'providers') {
                const res = await fetch('/api/providers')
                if (res.ok) setProviders(await res.json())
            } else {
                const res = await fetch('/api/settings')
                if (res.ok) setUserSettings(await res.json())
            }
        } catch (e) {
            console.error(e)
        } finally {
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
            const res = await fetch('/api/providers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: formProvider,
                    model: formModel,
                    apiKey: formKey,
                    dailyBudget: formBudget
                })
            })
            if (res.ok) {
                setShowModal(false)
                setFormKey('')
                fetchData()
            }
        } catch (e) {
            console.error(e)
        }
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

    return (
        <div className="flex h-screen bg-gray-950 text-white">
            <div className="hidden md:block">
                <div className="w-64 h-full bg-gray-950 border-r border-gray-800 p-4">
                    <Link href="/" className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6">
                        ← Back to Chat
                    </Link>
                    <h1 className="text-xl font-bold mb-4">Settings</h1>
                    <div className="space-y-1">
                        {[
                            { id: 'providers', label: 'Providers', icon: Server },
                            { id: 'general', label: 'General', icon: User },
                            { id: 'security', label: 'Security', icon: Lock },
                        ].map((item) => (
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
                                                <Shield className="w-5 h-5 text-gray-400" />
                                            </div>
                                            <div>
                                                <h3 className="font-medium capitalize flex items-center gap-2">
                                                    {p.provider}
                                                    <span className="text-xs px-2 py-0.5 bg-gray-800 rounded-full text-gray-400 font-mono">{p.model}</span>
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
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteProvider(p.id)}
                                            className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
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
            </div>

            {/* Add Provider Modal (Same as before) */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md p-6 shadow-2xl">
                        <h3 className="text-lg font-medium mb-4">Add Provider</h3>
                        <form onSubmit={handleAddProvider} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">Provider</label>
                                <select
                                    value={formProvider}
                                    onChange={(e) => setFormProvider(e.target.value)}
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
                                >
                                    <option value="anthropic">Anthropic (Claude)</option>
                                    <option value="openai">OpenAI (GPT)</option>
                                    <option value="google">Google (Gemini)</option>
                                    <option value="mistral">Mistral AI</option>
                                    <option value="deepseek">DeepSeek</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">Model ID</label>
                                <input
                                    type="text"
                                    value={formModel}
                                    onChange={e => setFormModel(e.target.value)}
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
                                    placeholder="e.g. gpt-4-turbo"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">API Key</label>
                                <input
                                    type="password"
                                    value={formKey}
                                    onChange={e => setFormKey(e.target.value)}
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
                                    placeholder="sk-..."
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">Daily Budget ($)</label>
                                <input
                                    type="number"
                                    value={formBudget}
                                    onChange={e => setFormBudget(e.target.value)}
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
                                    min="1"
                                />
                            </div>

                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium text-white">Save Provider</button>
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
