'use client'

import { HyggeButton } from './HyggeButton'

export function HyggeModal({ open, onClose, title, children }: {
    open: boolean; onClose: () => void; title: string; children: React.ReactNode
}) {
    if (!open) return null
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-[var(--hg-bg)] border border-[var(--hg-border)] w-full max-w-lg mx-4 overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between border-b border-[var(--hg-border)] px-4 py-3">
                    <h3 className="text-sm font-medium text-[var(--hg-text-primary)]">{title}</h3>
                    <HyggeButton onClick={onClose} className="text-xs">close</HyggeButton>
                </div>
                <div className="p-4">{children}</div>
            </div>
        </div>
    )
}
