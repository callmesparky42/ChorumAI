'use client'

import { useState, useEffect } from 'react'
import { Search, Loader2, Key, CheckCircle, XCircle } from 'lucide-react'
import clsx from 'clsx'

export function SearchSettings() {
    const [enabled, setEnabled] = useState(false)
    const [autoSearch, setAutoSearch] = useState(false)
    const [hasApiKey, setHasApiKey] = useState(false)
    const [apiKey, setApiKey] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

    useEffect(() => {
        fetchSettings()
    }, [])

    async function fetchSettings() {
        try {
            const res = await fetch('/api/settings/search')
            if (res.ok) {
                const data = await res.json()
                setEnabled(data.enabled)
                setAutoSearch(data.autoSearch)
                setHasApiKey(data.hasApiKey)
            }
        } catch (error) {
            console.error('Failed to fetch search settings:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleSave() {
        setSaving(true)
        setTestResult(null)
        try {
            const res = await fetch('/api/settings/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    enabled,
                    autoSearch,
                    apiKey: apiKey || undefined // Only send if entered
                })
            })

            if (res.ok) {
                setHasApiKey(true)
                setApiKey('') // Clear input after save
                setTestResult({ success: true, message: 'Settings saved successfully' })
            } else {
                const data = await res.json()
                setTestResult({ success: false, message: data.error || 'Failed to save settings' })
            }
        } catch (error) {
            setTestResult({ success: false, message: 'An unexpected error occurred' })
        } finally {
            setSaving(false)
        }
    }

    async function handleTestKey() {
        if (!apiKey) return
        setTesting(true)
        setTestResult(null)
        try {
            // We can use the save endpoint to validate, but it also saves.
            // Ideally we'd have a separate validate endpoint or just rely on save validation.
            // The backend POST route validates the key if provided.
            // So let's just use handleSave but calling it "Test & Save" in UI logic
            await handleSave()
        } finally {
            setTesting(false)
        }
    }

    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-900/30 rounded-lg">
                    <Search className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                    <h3 className="text-lg font-medium text-white">Web Search</h3>
                    <p className="text-sm text-gray-400">
                        Enable LLMs to search the internet for real-time information using Serper.dev.
                    </p>
                </div>
            </div>

            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 space-y-6">
                {/* Master Toggle */}
                <div className="flex items-center justify-between">
                    <div>
                        <h4 className="font-medium text-white">Enable Web Search</h4>
                        <div className="text-sm text-gray-500">
                            Adds a <code>web_search</code> tool that LLMs can use to find current data.
                        </div>
                    </div>
                    <button
                        onClick={() => setEnabled(!enabled)}
                        className={clsx(
                            "w-12 h-6 rounded-full transition-colors relative",
                            enabled ? "bg-blue-600" : "bg-gray-700"
                        )}
                    >
                        <span className={clsx("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", enabled ? "left-7" : "left-1")} />
                    </button>
                </div>

                {/* API Key Input */}
                <div className="space-y-3 pt-4 border-t border-gray-800">
                    <div className="flex justify-between">
                        <label className="block text-sm font-medium text-gray-300">Serper API Key</label>
                        <a href="https://serper.dev" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300">
                            Get a free key →
                        </a>
                    </div>

                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Key className="w-4 h-4 text-gray-500" />
                            </div>
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder={hasApiKey ? "•••••••••••••••• (Configured)" : "Enter Serper API Key"}
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-blue-500 placeholder-gray-600"
                            />
                        </div>
                        <button
                            onClick={handleTestKey}
                            disabled={!apiKey || saving}
                            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                        >
                            {saving ? 'Testing...' : 'Test & Save'}
                        </button>
                    </div>
                    {hasApiKey && !apiKey && (
                        <div className="flex items-center gap-2 text-xs text-green-400">
                            <CheckCircle className="w-3 h-3" />
                            <span>API key is configured and ready.</span>
                        </div>
                    )}
                </div>

                {/* Auto Search Setting */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-800 opacity-50 pointer-events-none">
                    <div>
                        <h4 className="font-medium text-white">Auto-Detect Search Intent</h4>
                        <div className="text-sm text-gray-500">
                            Automatically perform searches when queries ask about recent events (Coming soon).
                        </div>
                    </div>
                    <button
                        onClick={() => setAutoSearch(!autoSearch)}
                        disabled
                        className={clsx(
                            "w-12 h-6 rounded-full transition-colors relative",
                            autoSearch ? "bg-blue-600" : "bg-gray-700"
                        )}
                    >
                        <span className={clsx("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", autoSearch ? "left-7" : "left-1")} />
                    </button>
                </div>

                {/* Global Save Button */}
                <div className="pt-4 flex justify-between items-center border-t border-gray-800">
                    {testResult && (
                        <div className={clsx("text-sm flex items-center gap-2", testResult.success ? "text-green-400" : "text-red-400")}>
                            {testResult.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                            {testResult.message}
                        </div>
                    )}
                    {!testResult && <div></div>} {/* Spacer */}

                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Save Configuration
                    </button>
                </div>
            </div>
        </div>
    )
}
