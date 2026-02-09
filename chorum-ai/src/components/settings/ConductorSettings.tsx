'use client'

import { useState, useEffect } from 'react'
import { Music, Loader2, Save, Info } from 'lucide-react'
import clsx from 'clsx'

interface ConductorSettingsProps {
    projectId: string
    className?: string
}

const DOMAIN_OPTIONS = [
    'frontend', 'backend', 'database', 'security', 'testing',
    'coding', 'api', 'auth', 'ui', 'performance', 'deployment'
]

export function ConductorSettings({ projectId, className }: ConductorSettingsProps) {
    const [lens, setLens] = useState(1.0)
    const [focusDomains, setFocusDomains] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [isDirty, setIsDirty] = useState(false)

    useEffect(() => {
        fetchSettings()
    }, [projectId])

    const fetchSettings = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/conductor/lens?projectId=${projectId}`)
            if (res.ok) {
                const data = await res.json()
                setLens(data.lens)
                setFocusDomains(data.focusDomains || [])
            }
        } catch (e) {
            console.error('Failed to fetch conductor settings:', e)
        } finally {
            setLoading(false)
        }
    }

    const saveSettings = async () => {
        setSaving(true)
        try {
            const res = await fetch('/api/conductor/lens', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, lens, focusDomains })
            })
            if (res.ok) {
                setIsDirty(false)
            }
        } catch (e) {
            console.error('Failed to save conductor settings:', e)
        } finally {
            setSaving(false)
        }
    }

    const handleLensChange = (value: number) => {
        setLens(value)
        setIsDirty(true)
    }

    const toggleDomain = (domain: string) => {
        if (focusDomains.includes(domain)) {
            setFocusDomains(focusDomains.filter(d => d !== domain))
        } else {
            setFocusDomains([...focusDomains, domain])
        }
        setIsDirty(true)
    }

    if (loading) {
        return (
            <div className={clsx("flex items-center justify-center p-6", className)}>
                <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
            </div>
        )
    }

    return (
        <div className={clsx("space-y-6", className)}>
            {/* Header */}
            <div className="flex items-center gap-3">
                <Music className="w-5 h-5 text-purple-400" />
                <h3 className="font-medium text-white">Conductor Settings</h3>
            </div>

            {/* Explanation */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 flex gap-3">
                <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-sm text-gray-400">
                    The Conductor controls how much project context is injected into your conversations.
                    Adjust the lens to change the memory budget, and set focus domains to prioritize specific topics.
                </p>
            </div>

            {/* Conductor Lens Slider */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-300">
                        Conductor Lens
                    </label>
                    <span className={clsx(
                        "text-sm font-mono",
                        lens < 0.5 ? "text-orange-400" :
                            lens > 1.5 ? "text-green-400" :
                                "text-gray-400"
                    )}>
                        {lens.toFixed(2)}x
                    </span>
                </div>
                <input
                    type="range"
                    min="0.25"
                    max="2.0"
                    step="0.25"
                    value={lens}
                    onChange={(e) => handleLensChange(parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
                <div className="flex justify-between text-xs text-gray-600">
                    <span>0.25x (Minimal)</span>
                    <span>1.0x (Default)</span>
                    <span>2.0x (Maximum)</span>
                </div>
                <p className="text-xs text-gray-500">
                    {lens < 0.5
                        ? "Minimal context injection — faster responses, less memory"
                        : lens > 1.5
                            ? "Maximum context — more memory items, slower but more informed"
                            : "Balanced context injection"}
                </p>
            </div>

            {/* Focus Domains */}
            <div className="space-y-3">
                <label className="text-sm font-medium text-gray-300">
                    Focus Domains
                </label>
                <p className="text-xs text-gray-500">
                    Items matching these domains get a score boost (+15%)
                </p>
                <div className="flex flex-wrap gap-2">
                    {DOMAIN_OPTIONS.map(domain => (
                        <button
                            key={domain}
                            onClick={() => toggleDomain(domain)}
                            className={clsx(
                                "px-3 py-1.5 text-sm rounded-full border transition-colors",
                                focusDomains.includes(domain)
                                    ? "bg-purple-500/20 border-purple-500/50 text-purple-300"
                                    : "bg-gray-900/50 border-gray-700 text-gray-400 hover:border-gray-600"
                            )}
                        >
                            {domain}
                        </button>
                    ))}
                </div>
            </div>

            {/* Save Button */}
            {isDirty && (
                <div className="flex justify-end">
                    <button
                        onClick={saveSettings}
                        disabled={saving}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 rounded-lg text-sm font-medium flex items-center gap-2"
                    >
                        {saving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        Save Settings
                    </button>
                </div>
            )}
        </div>
    )
}
