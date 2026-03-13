'use client'

export default function KnowledgeDashboardError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    return (
        <div className="p-8 flex flex-col items-center justify-center h-full">
            <h2 className="text-lg text-[var(--hg-text-primary)] mb-2">Knowledge Dashboard Error</h2>
            <p className="text-sm text-[var(--hg-text-secondary)] mb-4 max-w-md text-center">
                Something went wrong loading the Knowledge Dashboard. This is likely a database connectivity issue.
            </p>
            <p className="text-xs text-[var(--hg-text-tertiary)] font-mono mb-6">
                {error.message}
            </p>
            <button
                onClick={reset}
                className="hg-btn hg-btn-accent"
            >
                Try again
            </button>
        </div>
    )
}
