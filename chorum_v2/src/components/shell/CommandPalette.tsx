'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'
import { searchKnowledge } from '@/lib/shell/actions'

export function CommandPalette() {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<{ learnings: any[], conversations: any[] }>({ learnings: [], conversations: [] })
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault()
                setOpen((o) => !o)
            } else if (e.key === 'Escape' && open) {
                setOpen(false)
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [open])

    useEffect(() => {
        if (!open) { setQuery(''); setResults({ learnings: [], conversations: [] }); return }
        if (query.trim().length === 0) { setResults({ learnings: [], conversations: [] }); return }

        const timer = setTimeout(async () => {
            setLoading(true)
            try {
                const res = await searchKnowledge(query)
                setResults(res)
                setSelectedIndex(0)
            } catch (e) {
                console.error('Search failed', e)
            } finally {
                setLoading(false)
            }
        }, 300)
        return () => clearTimeout(timer)
    }, [query, open])

    const actions = [
        { label: '→ New conversation', act: () => { setOpen(false); router.push('/chat?new=1') } },
        { label: '→ Add learning', act: () => { setOpen(false); router.push('/knowledge?add=1') } },
        { label: '→ Settings', act: () => { setOpen(false); router.push('/settings') } },
    ]

    const totalItems = (results?.learnings?.length || 0) + (results?.conversations?.length || 0) + actions.length

    useEffect(() => {
        const handleNavigation = (e: KeyboardEvent) => {
            if (!open) return
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedIndex(i => (i + 1) % totalItems)
            } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedIndex(i => (i - 1 + totalItems) % totalItems)
            } else if (e.key === 'Enter' && totalItems > 0) {
                e.preventDefault()
                executeSelected()
            }
        }
        window.addEventListener('keydown', handleNavigation)
        return () => window.removeEventListener('keydown', handleNavigation)
    }, [open, totalItems, selectedIndex, results])

    const executeSelected = () => {
        if (selectedIndex < actions.length) {
            const action = actions[selectedIndex]
            if (action) action.act()
        } else if (selectedIndex < actions.length + results.conversations.length) {
            const conv = results.conversations[selectedIndex - actions.length]
            setOpen(false)
            router.push(`/chat?id=${conv.id}`)
        } else {
            setOpen(false)
            router.push(`/knowledge`)
        }
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
            <div
                className="bg-[var(--hg-surface)] border border-[var(--hg-border)] w-full max-w-2xl mx-4 overflow-hidden shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex border-b border-[var(--hg-border)] items-center px-4">
                    <span className="text-[var(--hg-text-secondary)] mr-3">🔍</span>
                    <input
                        autoFocus
                        className="flex-1 bg-transparent py-4 text-[var(--hg-text-primary)] placeholder:text-[var(--hg-text-tertiary)] outline-none"
                        placeholder="Search learnings, conversations..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                    />
                    {loading && <span className="inline-block w-4 h-4 border-2 border-[var(--hg-text-secondary)] border-t-transparent rounded-full animate-spin" />}
                </div>

                <div className="max-h-[50vh] overflow-y-auto p-2">
                    {actions.length > 0 && (
                        <div className="mb-4">
                            <h3 className="text-xs font-mono text-[var(--hg-text-tertiary)] uppercase tracking-wider px-2 mb-2">Actions</h3>
                            {actions.map((act, i) => (
                                <div
                                    key={act.label}
                                    className={clsx(
                                        "px-3 py-2 text-sm cursor-pointer border-l-2 transition-colors",
                                        selectedIndex === i ? "border-[var(--hg-accent)] bg-[var(--hg-surface-hover)] text-[var(--hg-text-primary)]" : "border-transparent text-[var(--hg-text-secondary)] hover:bg-[var(--hg-surface-hover)]"
                                    )}
                                    onClick={() => act.act()}
                                    onMouseMove={() => setSelectedIndex(i)}
                                >
                                    {act.label}
                                </div>
                            ))}
                        </div>
                    )}

                    {results.conversations.length > 0 && (
                        <div className="mb-4">
                            <h3 className="text-xs font-mono text-[var(--hg-text-tertiary)] uppercase tracking-wider px-2 mb-2">Conversations</h3>
                            {results.conversations.map((conv, i) => {
                                const idx = actions.length + i
                                return (
                                    <div
                                        key={conv.id}
                                        className={clsx(
                                            "px-3 py-2 text-sm cursor-pointer border-l-2 transition-colors",
                                            selectedIndex === idx ? "border-[var(--hg-accent)] bg-[var(--hg-surface-hover)] text-[var(--hg-text-primary)]" : "border-transparent text-[var(--hg-text-secondary)] hover:bg-[var(--hg-surface-hover)]"
                                        )}
                                        onClick={() => { setOpen(false); router.push(`/chat?id=${conv.id}`) }}
                                        onMouseMove={() => setSelectedIndex(idx)}
                                    >
                                        {new Date(conv.updated_at).toLocaleDateString()} — "{conv.metadata?.firstMessageSnippet || conv.id}"
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {results.learnings.length > 0 && (
                        <div className="mb-2">
                            <h3 className="text-xs font-mono text-[var(--hg-text-tertiary)] uppercase tracking-wider px-2 mb-2">Learnings</h3>
                            {results.learnings.map((learning, i) => {
                                const idx = actions.length + results.conversations.length + i
                                return (
                                    <div
                                        key={learning.id}
                                        className={clsx(
                                            "px-3 py-2 text-sm cursor-pointer border-l-2 transition-colors",
                                            selectedIndex === idx ? "border-[var(--hg-accent)] bg-[var(--hg-surface-hover)] text-[var(--hg-text-primary)]" : "border-transparent text-[var(--hg-text-secondary)] hover:bg-[var(--hg-surface-hover)]"
                                        )}
                                        onClick={() => { setOpen(false); router.push(`/knowledge`) }}
                                        onMouseMove={() => setSelectedIndex(idx)}
                                    >
                                        <span className="text-[var(--hg-text-tertiary)] capitalize">{learning.type}: </span>
                                        <span className="truncate">"{learning.content}"</span>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {query.trim().length > 0 && !loading && totalItems === actions.length && (
                        <div className="p-8 text-center text-sm text-[var(--hg-text-tertiary)]">
                            No specific learnings or conversations found.
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
