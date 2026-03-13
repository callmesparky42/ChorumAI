'use client'

import { useState } from 'react'
import type { LearningFilters } from '@/lib/shell/knowledge-actions'

const TYPE_OPTIONS = [
    { value: '', label: 'All Types' },
    { value: 'pattern', label: 'Pattern' },
    { value: 'invariant', label: 'Rule' },
    { value: 'antipattern', label: 'Avoid' },
    { value: 'golden_path', label: 'How-to' },
    { value: 'decision', label: 'Decision' },
    { value: 'anchor', label: 'Anchor' },
    { value: 'character', label: 'Character' },
    { value: 'voice', label: 'Voice' },
]

const STATUS_OPTIONS = [
    { value: '', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'pinned', label: 'Pinned' },
    { value: 'muted', label: 'Muted' },
    { value: 'dormant', label: 'Dormant' },
]

const SORT_OPTIONS = [
    { value: 'created', label: 'Created' },
    { value: 'confidence', label: 'Confidence' },
    { value: 'strength', label: 'Strength' },
    { value: 'lastUsed', label: 'Last Used' },
]

export function KnowledgeFilterBar({
    filters,
    onFiltersChange,
    appFilter,
}: {
    filters: LearningFilters
    onFiltersChange: (f: LearningFilters) => void
    appFilter: string | null
}) {
    const [searchVal, setSearchVal] = useState(filters.search ?? '')

    const update = (patch: Partial<LearningFilters>) =>
        onFiltersChange({ ...filters, ...patch })

    const handleSearch = () => {
        update({ search: searchVal || null })
    }

    return (
        <div className="flex flex-wrap items-center gap-2 mb-3">
            {/* App filter pill (read-only, set by clicking app card) */}
            {appFilter && (
                <span className="px-2 py-0.5 text-[10px] font-mono bg-[var(--hg-accent-muted)] text-[var(--hg-accent)] border border-[var(--hg-accent)]">
                    {appFilter}
                </span>
            )}

            {/* Type */}
            <select
                className="bg-[var(--hg-surface)] border border-[var(--hg-border)] px-2 py-1 text-xs text-[var(--hg-text-secondary)] outline-none"
                value={filters.type ?? ''}
                onChange={e => update({ type: e.target.value || null })}
            >
                {TYPE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>

            {/* Status */}
            <select
                className="bg-[var(--hg-surface)] border border-[var(--hg-border)] px-2 py-1 text-xs text-[var(--hg-text-secondary)] outline-none"
                value={filters.status ?? ''}
                onChange={e => update({ status: e.target.value || null })}
            >
                {STATUS_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>

            {/* Sort */}
            <select
                className="bg-[var(--hg-surface)] border border-[var(--hg-border)] px-2 py-1 text-xs text-[var(--hg-text-secondary)] outline-none"
                value={filters.sortBy ?? 'created'}
                onChange={e => update({ sortBy: e.target.value as any })}
            >
                {SORT_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>

            {/* Sort direction */}
            <button
                className="px-2 py-1 text-xs text-[var(--hg-text-tertiary)] border border-[var(--hg-border)] bg-[var(--hg-surface)] hover:text-[var(--hg-text-primary)] transition-colors"
                onClick={() => update({ sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc' })}
            >
                {filters.sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
            </button>

            {/* Search */}
            <div className="flex ml-auto">
                <input
                    type="text"
                    className="bg-[var(--hg-surface)] border border-[var(--hg-border)] px-2 py-1 text-xs text-[var(--hg-text-primary)] outline-none w-40 placeholder:text-[var(--hg-text-tertiary)]"
                    placeholder="Search learnings..."
                    value={searchVal}
                    onChange={e => setSearchVal(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
                <button
                    onClick={handleSearch}
                    className="px-3 py-1 text-xs bg-[var(--hg-surface)] border border-l-0 border-[var(--hg-border)] text-[var(--hg-text-secondary)] hover:bg-[var(--hg-surface-hover)] hover:text-[var(--hg-text-primary)] transition-colors"
                >
                    Search
                </button>
            </div>
        </div>
    )
}
