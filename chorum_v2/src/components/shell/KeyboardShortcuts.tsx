'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { HyggeModal } from '../hygge'

export function KeyboardShortcuts() {
    const [open, setOpen] = useState(false)
    const router = useRouter()

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Cmd/Ctrl + N (New Conversation)
            if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
                e.preventDefault()
                router.push('/chat?new=1')
            }
            // Cmd/Ctrl + / (Help Modal)
            else if ((e.metaKey || e.ctrlKey) && e.key === '/') {
                e.preventDefault()
                setOpen((o) => !o)
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [router])

    return (
        <HyggeModal open={open} onClose={() => setOpen(false)} title="Keyboard Shortcuts">
            <div className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-[var(--hg-border)]">
                    <span className="text-sm text-[var(--hg-text-primary)]">Open command palette</span>
                    <kbd className="px-2 py-1 bg-[var(--hg-surface-hover)] border border-[var(--hg-border)] text-xs font-mono text-[var(--hg-text-secondary)] rounded">Cmd/Ctrl + K</kbd>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[var(--hg-border)]">
                    <span className="text-sm text-[var(--hg-text-primary)]">New conversation</span>
                    <kbd className="px-2 py-1 bg-[var(--hg-surface-hover)] border border-[var(--hg-border)] text-xs font-mono text-[var(--hg-text-secondary)] rounded">Cmd/Ctrl + N</kbd>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[var(--hg-border)]">
                    <span className="text-sm text-[var(--hg-text-primary)]">Show shortcuts help</span>
                    <kbd className="px-2 py-1 bg-[var(--hg-surface-hover)] border border-[var(--hg-border)] text-xs font-mono text-[var(--hg-text-secondary)] rounded">Cmd/Ctrl + /</kbd>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[var(--hg-border)]">
                    <span className="text-sm text-[var(--hg-text-primary)]">Close modal / command palette</span>
                    <kbd className="px-2 py-1 bg-[var(--hg-surface-hover)] border border-[var(--hg-border)] text-xs font-mono text-[var(--hg-text-secondary)] rounded">Escape</kbd>
                </div>
            </div>
        </HyggeModal>
    )
}
