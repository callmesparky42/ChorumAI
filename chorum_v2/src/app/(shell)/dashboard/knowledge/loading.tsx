export default function KnowledgeDashboardLoading() {
    return (
        <div className="p-4 md:p-8 h-full overflow-y-auto w-full max-w-6xl">
            <div className="mb-6">
                <div className="h-6 w-56 bg-[var(--hg-surface)] animate-pulse mb-2" />
                <div className="h-4 w-40 bg-[var(--hg-surface)] animate-pulse" />
            </div>

            {/* Apps + Health skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="flex gap-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-32 w-56 bg-[var(--hg-surface)] border border-[var(--hg-border)] animate-pulse" />
                    ))}
                </div>
                <div className="grid grid-cols-5 gap-3">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="h-20 bg-[var(--hg-surface)] border border-[var(--hg-border)] animate-pulse" />
                    ))}
                </div>
            </div>

            {/* Decay Map skeleton */}
            <div className="h-[280px] bg-[var(--hg-surface)] border border-[var(--hg-border)] animate-pulse mb-6" />

            {/* Domain + Confidence skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="h-[340px] bg-[var(--hg-surface)] border border-[var(--hg-border)] animate-pulse" />
                <div className="h-[200px] bg-[var(--hg-surface)] border border-[var(--hg-border)] animate-pulse" />
            </div>

            {/* Feed skeleton */}
            <div className="h-[300px] bg-[var(--hg-surface)] border border-[var(--hg-border)] animate-pulse" />
        </div>
    )
}
