'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import { useState } from 'react'

const NAV_ITEMS = [
    { href: '/chat', label: 'Chat' },
    { href: '/knowledge', label: 'Knowledge' },
    { href: '/inbox', label: 'Inbox' },
    { href: '/audit', label: 'Audit' },
    { href: '/settings', label: 'Settings' },
]

export function ShellSidebar({ userId, inboxCount }: { userId: string, inboxCount: number }) {
    const pathname = usePathname()
    const [isOpen, setIsOpen] = useState(false)

    const navContent = (
        <>
            <div className="px-4 py-4 border-b border-[var(--hg-border)] flex justify-between items-center">
                <div>
                    <span className="text-sm font-medium text-[var(--hg-text-primary)]">Chorum</span>
                    <span className="text-xs text-[var(--hg-accent)] ml-1">v2</span>
                </div>
                <button className="md:hidden text-[var(--hg-text-secondary)] text-xl leading-none" onClick={() => setIsOpen(false)}>×</button>
            </div>

            <nav className="flex-1 py-2">
                {NAV_ITEMS.map((item) => {
                    const isActive = pathname.startsWith(item.href)
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setIsOpen(false)}
                            className={clsx(
                                'block px-4 py-2 text-sm border-l-2 transition-colors',
                                isActive
                                    ? 'border-[var(--hg-accent)] text-[var(--hg-text-primary)] bg-[var(--hg-surface)]'
                                    : 'border-transparent text-[var(--hg-text-secondary)] hover:text-[var(--hg-text-primary)] hover:bg-[var(--hg-surface-hover)]',
                            )}
                        >
                            {item.label}
                            {item.href === '/inbox' && inboxCount > 0 && (
                                <span className="text-[var(--hg-accent)] ml-1">{inboxCount}</span>
                            )}
                        </Link>
                    )
                })}
            </nav>

            <div className="px-4 py-3 border-t border-[var(--hg-border)]">
                <span className="text-xs text-[var(--hg-text-tertiary)]">v2.0.0-alpha.5</span>
            </div>
        </>
    )

    return (
        <>
            <button
                className="md:hidden fixed top-3 left-4 z-30 p-2 text-[var(--hg-text-primary)] bg-[var(--hg-surface)] border border-[var(--hg-border)]"
                onClick={() => setIsOpen(true)}
            >
                ☰
            </button>

            {/* Desktop Sidebar */}
            <aside className="hidden md:flex flex-col w-48 border-r border-[var(--hg-border)] bg-[var(--hg-bg)]">
                {navContent}
            </aside>

            {/* Mobile Overlay Sidebar */}
            {isOpen && (
                <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden" onClick={() => setIsOpen(false)}>
                    <aside
                        className="flex flex-col w-64 h-full bg-[var(--hg-bg)] border-r border-[var(--hg-border)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {navContent}
                    </aside>
                </div>
            )}
        </>
    )
}
