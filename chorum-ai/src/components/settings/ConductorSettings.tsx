'use client'

import { useState, useEffect } from 'react'
import clsx from 'clsx'
import { HyggeButton } from '@/components/hygge/HyggeButton'

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
            <div className={clsx("flex items-center justify-center p-6 text-[var(--hg-text-tertiary)]", className)}>
                Loading conductor settings...
            </div>
        )
    }

    return (
        <div className={clsx("space-y-6", className)}>
            <div>
                <h3 className="font-medium text-[var(--hg-text-primary)]">Conductor Settings</h3>
            </div>

            {/* Explanation */}
            <div className="bg-[var(--hg-surface)] border border-[var(--hg-border)] p-3">
                <p className="text-sm text-[var(--hg-text-secondary)]">
                    The Conductor controls how much project context is injected into your conversations.
                    Adjust the lens to change the memory budget, and set focus domains to prioritize specific topics.
                </p>
            </div>

            {/* Conductor Lens Slider */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-[var(--hg-text-secondary)]">
                        Conductor Lens
                    </label>
                    <span className={clsx(
                        "text-sm font-mono",
                        lens < 0.5 ? "text-[var(--hg-destructive)]" :
                            lens > 1.5 ? "text-[var(--hg-accent)]" :
                                "text-[var(--hg-text-tertiary)]"
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
                    className="w-full h-2 bg-[var(--hg-border)] appearance-none cursor-pointer accent-[var(--hg-accent)]"
                />
                <div className="flex justify-between text-xs text-[var(--hg-text-tertiary)]">
                    <span>0.25x (Minimal)</span>
                    <span>1.0x (Default)</span>
                    <span>2.0x (Maximum)</span>
                </div>
                <p className="text-xs text-[var(--hg-text-tertiary)]">
                    {lens < 0.5
                        ? "Minimal context injection — faster responses, less memory"
                        : lens > 1.5
                            ? "Maximum context — more memory items, slower but more informed"
                            : "Balanced context injection"}
                </p>
            </div>

            {/* Focus Domains */}
            <div className="space-y-3">
                <label className="text-sm font-medium text-[var(--hg-text-secondary)]">
                    Focus Domains
                </label>
                <p className="text-xs text-[var(--hg-text-tertiary)]">
                    Items matching these domains get a score boost (+15%)
                </p>
                <div className="flex flex-wrap gap-2">
                    {DOMAIN_OPTIONS.map(domain => (
                        <button
                            key={domain}
                            onClick={() => toggleDomain(domain)}
                            className={clsx(
                                "px-3 py-1.5 text-sm border transition-colors",
                                focusDomains.includes(domain)
                                    ? "bg-[var(--hg-accent-muted)] border-[var(--hg-accent)] text-[var(--hg-accent)]"
                                    : "bg-[var(--hg-bg)] border-[var(--hg-border)] text-[var(--hg-text-secondary)] hover:border-[var(--hg-border-subtle)]"
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
                    <HyggeButton
                        onClick={saveSettings}
                        disabled={saving}
                        variant="accent"
                        className="text-sm"
                    >
                        {saving ? 'Saving...' : 'Save Settings'}
                    </HyggeButton>
                </div>
            )}
        </div>
    )
}
