'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { HyggeCard, HyggeButton, HyggeInput, HyggeToast } from '@/components/hygge'
import { getKnowledge, addLearning, getNebulaStats } from '@/lib/shell/actions'
import type { NebulaStats } from '@/lib/shell/actions'

const NebulaCharts = dynamic(
    () => import('@/components/shell/NebulaCharts').then(m => m.NebulaCharts),
    { ssr: false, loading: () => <div className="h-32" /> }
)

const HUMAN_TYPE_MAP: Record<string, string> = {
    invariant: 'Rule', pattern: 'Pattern', antipattern: 'Thing to avoid',
    decision: 'Decision', golden_path: 'How-to',
    anchor: 'Anchor', character: 'Character', setting: 'Setting',
    plot_thread: 'Plot thread', voice: 'Voice', world_rule: 'World rule'
}

export default function KnowledgePage() {
    const [learnings, setLearnings] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [adding, setAdding] = useState(false)
    const [nebulaStats, setNebulaStats] = useState<NebulaStats | null>(null)

    // Add form state
    const [newContent, setNewContent] = useState('')
    const [newType, setNewType] = useState('invariant')
    const [newScopes, setNewScopes] = useState('')
    const [toast, setToast] = useState<string | null>(null)

    const loadData = () => {
        Promise.all([
            getKnowledge().then((res: any) => {
                setLearnings(Array.isArray(res) ? res : (res.items || []))
            }),
            getNebulaStats().then(setNebulaStats).catch(() => null),
        ]).finally(() => setLoading(false))
    }

    useEffect(() => {
        loadData()
    }, [])

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newContent.trim()) return
        const scopesArr = newScopes.split(',').map(s => s.trim().startsWith('#') ? s.trim() : `#${s.trim()}`).filter(s => s !== '#')

        try {
            await addLearning(newContent, newType as Parameters<typeof addLearning>[1], scopesArr.length ? scopesArr : ['#general'])
            setToast('Learning added to Nebula graph.')
            setAdding(false)
            setNewContent('')
            setNewScopes('')
            loadData()
        } catch (err) {
            setToast('Failed to add learning.')
        }
    }

    const importTemplate = async (templateName: string) => {
        try {
            const { importTemplate: importFn } = await import('@/lib/shell/actions')
            const { imported } = await importFn(templateName)
            setToast(`Imported ${imported} learnings. Your knowledge graph is ready.`)
            loadData()
        } catch (e) {
            setToast('Failed to import template.')
        }
    }

    if (loading) return <div className="p-8">Loading knowledge graph...</div>

    return (
        <div className="p-4 md:p-8 h-full overflow-y-auto w-full max-w-5xl">
            {toast && <HyggeToast message={toast} />}

            {nebulaStats && <NebulaCharts stats={nebulaStats} />}

            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-xl font-medium">Knowledge Graph</h1>
                    <p className="text-sm text-[var(--hg-text-secondary)] mt-1">{learnings.length} total learnings</p>
                </div>
                <HyggeButton variant="accent" onClick={() => setAdding(!adding)}>
                    {adding ? 'Cancel' : '+ Add Learning'}
                </HyggeButton>
            </div>

            {adding && (
                <HyggeCard className="mb-8 border-[var(--hg-accent)]">
                    <form onSubmit={handleAdd} className="space-y-4">
                        <HyggeInput
                            label="Learning Content"
                            value={newContent}
                            onChange={e => setNewContent(e.target.value)}
                            placeholder="e.g., Always use prepared statements for SQL queries."
                            autoFocus
                        />
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-[var(--hg-text-secondary)] mb-1">Type</label>
                                <select
                                    className="w-full bg-[var(--hg-surface)] border border-[var(--hg-border)] px-3 py-2 text-sm outline-none text-[var(--hg-text-primary)]"
                                    value={newType}
                                    onChange={e => setNewType(e.target.value)}
                                >
                                    {Object.entries(HUMAN_TYPE_MAP).map(([sys, hum]) => (
                                        <option key={sys} value={sys}>{hum}</option>
                                    ))}
                                </select>
                            </div>
                            <HyggeInput
                                label="Scopes (comma separated)"
                                value={newScopes}
                                onChange={e => setNewScopes(e.target.value)}
                                placeholder="#sql, #security"
                            />
                        </div>
                        <HyggeButton type="submit" variant="accent" disabled={!newContent.trim()}>Save Learning</HyggeButton>
                    </form>
                </HyggeCard>
            )}

            {learnings.length === 0 ? (
                <div className="mt-8 border border-dashed border-[var(--hg-border)] p-12 flex flex-col items-center justify-center text-center">
                    <p className="text-[var(--hg-text-primary)] mb-4">Your knowledge graph is empty.</p>
                    <p className="text-sm text-[var(--hg-text-secondary)] mb-8 max-w-md">
                        Start chatting and Chorum will learn from your conversations, or add your first learning manually.
                    </p>
                    <HyggeButton onClick={() => setAdding(true)} variant="accent" className="mb-12">+ add first learning</HyggeButton>

                    <div className="w-full max-w-md border-t border-[var(--hg-border)] pt-8">
                        <h4 className="text-xs font-mono text-[var(--hg-text-tertiary)] uppercase tracking-wider mb-4 text-left">Quick Start Templates</h4>
                        <div className="space-y-2">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-[var(--hg-text-secondary)] hover:text-[var(--hg-text-primary)] cursor-default">React & Next.js patterns</span>
                                <button className="text-[var(--hg-accent)] hover:underline" onClick={() => importTemplate('react-nextjs')}>import →</button>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-[var(--hg-text-secondary)] hover:text-[var(--hg-text-primary)] cursor-default">Python best practices</span>
                                <button className="text-[var(--hg-accent)] hover:underline" onClick={() => importTemplate('python')}>import →</button>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-[var(--hg-text-secondary)] hover:text-[var(--hg-text-primary)] cursor-default">Creative writing conventions</span>
                                <button className="text-[var(--hg-accent)] hover:underline" onClick={() => importTemplate('creative-writing')}>import →</button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {learnings.map(l => (
                        <HyggeCard key={l.id} className="flex flex-col">
                            <div className="flex-1">
                                <span className="text-xs font-mono text-[var(--hg-text-tertiary)] uppercase tracking-wider mb-2 block">
                                    {HUMAN_TYPE_MAP[l.type] || l.type}
                                </span>
                                <p className="text-sm text-[var(--hg-text-primary)] mb-4">{l.content}</p>
                            </div>
                            <div className="flex gap-2">
                                {l.scopes?.map((s: string) => (
                                    <span key={s} className="text-[10px] text-[var(--hg-text-tertiary)] bg-[var(--hg-surface-hover)] px-1.5 py-0.5 border border-[var(--hg-border)]">
                                        {s}
                                    </span>
                                ))}
                            </div>
                        </HyggeCard>
                    ))}
                </div>
            )}
        </div>
    )
}
