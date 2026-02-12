'use client'

import { useState, useEffect } from 'react'
import clsx from 'clsx'
import { HyggeButton } from '@/components/hygge/HyggeButton'
import { HyggeToggle } from '@/components/hygge/HyggeToggle'

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
        return <div className="flex justify-center p-8 text-[var(--hg-text-tertiary)]">Loading search settings...</div>
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium text-[var(--hg-text-primary)]">Web Search</h3>
                <p className="text-sm text-[var(--hg-text-secondary)]">
                    Enable LLMs to search the internet for real-time information using Serper.dev.
                </p>
            </div>

            <div className="bg-[var(--hg-surface)] border border-[var(--hg-border)] p-6 space-y-6">
                <HyggeToggle
                    checked={enabled}
                    onChange={(v) => setEnabled(v)}
                    label="Enable Web Search"
                    description="Adds a web_search tool that LLMs can use to find current data."
                />

                {/* API Key Input */}
                <div className="space-y-3 pt-4 border-t border-[var(--hg-border)]">
                    <div className="flex justify-between items-center">
                        <label className="block text-sm font-medium text-[var(--hg-text-secondary)]">Serper API Key</label>
                        <a href="https://serper.dev" target="_blank" rel="noopener noreferrer" className="hg-btn hg-btn-accent text-xs">
                            Get a free key →
                        </a>
                    </div>

                    <div className="flex gap-2">
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder={hasApiKey ? "•••••••••••••••• (Configured)" : "Enter Serper API Key"}
                            className="flex-1 bg-[var(--hg-bg)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-primary)] placeholder-[var(--hg-text-tertiary)] focus:outline-none"
                        />
                        <HyggeButton
                            onClick={handleTestKey}
                            disabled={!apiKey || saving}
                            className="text-sm whitespace-nowrap"
                        >
                            {saving ? 'Testing...' : 'Test & Save'}
                        </HyggeButton>
                    </div>
                    {hasApiKey && !apiKey && (
                        <div className="text-xs text-[var(--hg-accent)]">API key is configured and ready.</div>
                    )}
                </div>

                {/* Auto Search Setting */}
                <div className="pt-4 border-t border-[var(--hg-border)] opacity-50 pointer-events-none">
                    <HyggeToggle
                        checked={autoSearch}
                        onChange={(v) => setAutoSearch(v)}
                        label="Auto-Detect Search Intent"
                        description="Automatically perform searches when queries ask about recent events (Coming soon)."
                    />
                </div>

                {/* Global Save Button */}
                <div className="pt-4 flex justify-between items-center border-t border-[var(--hg-border)]">
                    {testResult && (
                        <div className={clsx("text-sm", testResult.success ? "text-[var(--hg-accent)]" : "text-[var(--hg-destructive)]")}>
                            {testResult.message}
                        </div>
                    )}
                    {!testResult && <div></div>} {/* Spacer */}

                    <HyggeButton
                        onClick={handleSave}
                        disabled={saving}
                        variant="accent"
                        className="text-sm"
                    >
                        Save Configuration
                    </HyggeButton>
                </div>
            </div>
        </div>
    )
}
