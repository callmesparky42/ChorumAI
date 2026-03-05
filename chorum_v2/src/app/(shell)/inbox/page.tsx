'use client'

import { useState, useEffect } from 'react'
import { HyggeCard, HyggeButton, HyggeToast } from '@/components/hygge'
import { getPendingProposals, approveProposal, rejectProposal } from '@/lib/shell/actions'

const HUMAN_TYPE_MAP: Record<string, string> = {
    invariant: 'Rule', pattern: 'Pattern', antipattern: 'Thing to avoid',
    decision: 'Decision', golden_path: 'How-to'
}

export default function InboxPage() {
    const [proposals, setProposals] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [toast, setToast] = useState<string | null>(null)

    useEffect(() => {
        // Replace with actual user ID from context when available
        getPendingProposals().then(p => {
            setProposals(p)
            setLoading(false)
        })
    }, [])

    const handleAction = async (id: string, action: 'approve' | 'reject') => {
        try {
            if (action === 'approve') await approveProposal(id)
            else await rejectProposal(id)

            setProposals(p => p.filter(x => x.id !== id))
            setToast(`Proposal ${action === 'approve' ? 'approved' : 'rejected'}`)
        } catch (e) {
            console.error(e)
            setToast('Failed to process proposal')
        }
    }

    if (loading) return <div className="p-8">Loading proposals...</div>

    return (
        <div className="p-4 md:p-8 h-full overflow-y-auto max-w-4xl">
            {toast && <HyggeToast message={toast} />}

            <div className="flex items-center justify-between mb-8">
                <h1 className="text-xl font-medium">Conductor Inbox</h1>
                <span className="text-sm text-[var(--hg-text-secondary)]">{proposals.length} pending</span>
            </div>

            {proposals.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-[var(--hg-border)]">
                    <p className="text-[var(--hg-text-secondary)]">No pending proposals. The Conductor will surface items for review when it detects changes.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {proposals.map(p => (
                        <HyggeCard key={p.id} className="relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-1 h-full bg-[var(--hg-accent-warm)]" />
                            <div className="pl-4">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <span className="text-xs font-mono text-[var(--hg-accent-warm)] uppercase tracking-wider mb-1 block">
                                            Proposed {HUMAN_TYPE_MAP[p.proposedLearning.type] || p.proposedLearning.type}
                                        </span>
                                        <p className="text-[var(--hg-text-primary)] font-medium">"{p.proposedLearning.content}"</p>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <HyggeButton onClick={() => handleAction(p.id, 'reject')}>reject</HyggeButton>
                                        <HyggeButton variant="accent" onClick={() => handleAction(p.id, 'approve')}>approve</HyggeButton>
                                    </div>
                                </div>

                                <div className="bg-[var(--hg-bg)] p-3 border border-[var(--hg-border)] text-sm text-[var(--hg-text-secondary)]">
                                    <span className="text-[var(--hg-text-primary)] font-medium text-xs uppercase block mb-1">Rationale</span>
                                    {p.context}
                                </div>

                                <div className="mt-3 flex gap-2">
                                    {p.proposedLearning.scopes.map((s: string) => (
                                        <span key={s} className="text-xs text-[var(--hg-text-tertiary)] bg-[var(--hg-bg)] px-2 py-0.5 border border-[var(--hg-border-subtle)]">
                                            {s}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </HyggeCard>
                    ))}
                </div>
            )}
        </div>
    )
}
