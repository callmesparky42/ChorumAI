'use client'

import clsx from 'clsx'
import type { ConversationSummary } from '@/lib/shell/hooks'

export function ChatHistory({
    conversations,
    activeId,
    onSelect,
    onNew
}: {
    conversations: ConversationSummary[]
    activeId: string
    onSelect: (id: string) => void
    onNew: () => void
}) {
    // Group by rough time blocks (Today, Yesterday, Older)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const groups = {
        'Today': [] as ConversationSummary[],
        'Yesterday': [] as ConversationSummary[],
        'Older': [] as ConversationSummary[],
    }

    conversations.forEach(c => {
        const d = new Date(c.updated_at)
        if (d >= today) groups['Today'].push(c)
        else if (d >= yesterday) groups['Yesterday'].push(c)
        else groups['Older'].push(c)
    })

    return (
        <div className="flex flex-col h-full bg-[var(--hg-surface)] border-[var(--hg-border)] sm:border-r w-64">
            <div className="flex justify-between items-center p-4 border-b border-[var(--hg-border)]">
                <span className="text-sm font-medium text-[var(--hg-text-primary)]">Conversations</span>
                <button onClick={onNew} className="text-xs text-[var(--hg-accent)] hover:underline">+ new</button>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden">
                {Object.entries(groups).map(([label, items]) => {
                    if (items.length === 0) return null
                    return (
                        <div key={label} className="mt-4 first:mt-2">
                            <h4 className="px-4 text-xs font-mono text-[var(--hg-text-tertiary)] uppercase tracking-wider mb-2">{label}</h4>
                            <div className="flex flex-col">
                                {items.map(conv => (
                                    <button
                                        key={conv.id}
                                        onClick={() => onSelect(conv.id)}
                                        className={clsx(
                                            "text-left px-4 py-2 text-sm truncate transition-colors border-l-2",
                                            activeId === conv.id
                                                ? "border-[var(--hg-accent)] bg-[var(--hg-surface-hover)] text-[var(--hg-text-primary)]"
                                                : "border-transparent text-[var(--hg-text-secondary)] hover:text-[var(--hg-text-primary)] hover:bg-[var(--hg-surface-hover)]"
                                        )}
                                        title={conv.metadata?.firstMessageSnippet || 'New conversation'}
                                    >
                                        {conv.metadata?.firstMessageSnippet || 'New conversation'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
