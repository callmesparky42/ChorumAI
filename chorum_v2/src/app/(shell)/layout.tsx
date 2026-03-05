import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ShellSidebar } from '@/components/shell/ShellSidebar'
import { CommandPalette } from '@/components/shell/CommandPalette'
import { KeyboardShortcuts } from '@/components/shell/KeyboardShortcuts'
import { ShellErrorBoundary } from '@/components/shell/ShellErrorBoundary'
import { getPendingProposalCount } from '@/lib/shell/actions'

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
    let userId = '11111111-1111-1111-1111-111111111111'

    if (process.env.NODE_ENV !== 'development') {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) redirect('/api/auth/signin')
        userId = session.user.id
    }

    // Gracefully degrade if DB is unavailable (e.g. connection refused in dev)
    const inboxCount = await getPendingProposalCount(userId).catch(() => 0)

    return (
        <div className="flex h-screen bg-[var(--hg-bg)]">
            <ShellSidebar userId={userId} inboxCount={inboxCount} />
            <main className="flex-1 overflow-hidden relative">
                <ShellErrorBoundary>
                    {children}
                </ShellErrorBoundary>
            </main>
            <CommandPalette />
            <KeyboardShortcuts />
        </div>
    )
}
