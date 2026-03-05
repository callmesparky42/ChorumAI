'use client'
import clsx from 'clsx'

export function HyggeTabs({ tabs, active, onChange }: {
    tabs: { id: string; label: string }[]
    active: string
    onChange: (id: string) => void
}) {
    return (
        <div className="flex border-b border-[var(--hg-border)]">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    onClick={() => onChange(tab.id)}
                    className={clsx(
                        'px-4 py-2 text-sm transition-colors border-b-2 -mb-px',
                        active === tab.id
                            ? 'border-[var(--hg-accent)] text-[var(--hg-text-primary)]'
                            : 'border-transparent text-[var(--hg-text-tertiary)] hover:text-[var(--hg-text-secondary)]',
                    )}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    )
}
