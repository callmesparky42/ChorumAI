'use client'
import { useState, useEffect } from 'react'
import { Plus, Trash2, Shield, Activity, DollarSign, Loader2 } from 'lucide-react'
import { Sidebar } from '@/components/Sidebar'
import Link from 'next/link'

interface Provider {
    id: string
    provider: string
    model: string
    dailyBudget: string
    spentToday?: number
    isActive: boolean
}

export default function SettingsPage() {
    const [providers, setProviders] = useState<Provider[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)

    // Form
    const [formProvider, setFormProvider] = useState('anthropic')
    const [formModel, setFormModel] = useState('claude-3-5-sonnet-20240620')
    const [formKey, setFormKey] = useState('')
    const [formBudget, setFormBudget] = useState('10')

    useEffect(() => {
        fetchProviders()
    }, [])

    const fetchProviders = async () => {
        try {
            const res = await fetch('/api/providers')
            if (res.ok) setProviders(await res.json())
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    const handleAdd = async (e: React.FormEvent) => {
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
                fetchProviders()
            }
        } catch (e) {
            console.error(e)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Remove this provider? Keys will be deleted.')) return
        try {
            await fetch(`/api/providers?id=${id}`, { method: 'DELETE' })
            fetchProviders()
        } catch (e) {
            console.error(e)
        }
    }

    return (
        <div className="flex h-screen bg-gray-950 text-white">
            {/* Re-use Sidebar - simplistic wrapper */}
            <div className="hidden md:block">
                {/* Ideally we lift Sidebar state up to a Layout, but for this page we can just show a static back link or standard sidebar */}
                <div className="w-64 h-full bg-gray-950 border-r border-gray-800 p-4">
                    <Link href="/" className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6">
                        ← Back to Chat
                    </Link>
                    <h1 className="text-xl font-bold mb-4">Settings</h1>
                    <div className="space-y-1">
                        <button className="w-full text-left px-3 py-2 bg-blue-600/10 text-blue-400 rounded-lg text-sm font-medium">
                            Providers
                        </button>
                        <button className="w-full text-left px-3 py-2 text-gray-400 hover:bg-gray-900 rounded-lg text-sm transition-colors">
                            General
                        </button>
                        <button className="w-full text-left px-3 py-2 text-gray-400 hover:bg-gray-900 rounded-lg text-sm transition-colors">
                            Security
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 max-w-4xl">
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
                                    onClick={() => handleDelete(p.id)}
                                    className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Add Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md p-6 shadow-2xl">
                        <h3 className="text-lg font-medium mb-4">Add Provider</h3>
                        <form onSubmit={handleAdd} className="space-y-4">
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
