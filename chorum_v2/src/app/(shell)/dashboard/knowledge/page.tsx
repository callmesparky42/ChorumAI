'use client'

import { useState, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { AppRegistryGrid } from '@/components/knowledge/AppRegistryGrid'
import { CorpusHealthStrip } from '@/components/knowledge/CorpusHealthStrip'
import { KnowledgeFilterBar } from '@/components/knowledge/KnowledgeFilterBar'
import { LearningFeed } from '@/components/knowledge/LearningFeed'
import { LearningDetailDrawer } from '@/components/knowledge/LearningDetailDrawer'
import {
    getConnectedApps,
    getCorpusHealth,
    getDecayTimeSeries,
    getDomainDistribution,
    getConfidenceDistribution,
    getLearnings,
} from '@/lib/shell/knowledge-actions'
import type {
    AppRegistryEntry,
    CorpusHealthStats,
    DecayTimePoint,
    DomainPoint,
    ConfidenceStats,
    LearningItem,
    LearningFilters,
} from '@/lib/shell/knowledge-actions'
import { ResizableLayout } from '@/components/hygge/ResizableLayout'
import { getProjects, type Project } from '@/lib/shell/actions'

// Dynamic imports for chart components (no SSR)
const DecayMap = dynamic(
    () => import('@/components/knowledge/DecayMap').then(m => m.DecayMap),
    { ssr: false, loading: () => <div className="h-[280px] bg-[var(--hg-surface)] border border-[var(--hg-border)] animate-pulse" /> }
)
const DomainRadar = dynamic(
    () => import('@/components/knowledge/DomainRadar').then(m => m.DomainRadar),
    { ssr: false, loading: () => <div className="h-[340px] bg-[var(--hg-surface)] border border-[var(--hg-border)] animate-pulse" /> }
)
const ConfidenceBar = dynamic(
    () => import('@/components/knowledge/ConfidenceBar').then(m => m.ConfidenceBar),
    { ssr: false, loading: () => <div className="h-[200px] bg-[var(--hg-surface)] border border-[var(--hg-border)] animate-pulse" /> }
)

export default function KnowledgeDashboardPage() {
    const [apps, setApps] = useState<AppRegistryEntry[]>([])
    const [health, setHealth] = useState<CorpusHealthStats | null>(null)
    const [decayData, setDecayData] = useState<DecayTimePoint[]>([])
    const [domainData, setDomainData] = useState<DomainPoint[]>([])
    const [confidenceData, setConfidenceData] = useState<ConfidenceStats | null>(null)
    const [feedItems, setFeedItems] = useState<LearningItem[]>([])
    const [feedTotal, setFeedTotal] = useState(0)
    const [feedPage, setFeedPage] = useState(1)

    const [selectedApp, setSelectedApp] = useState<string | null>(null)
    const [decayDays, setDecayDays] = useState<14 | 30 | 90>(30)
    const [filters, setFilters] = useState<LearningFilters>({ sortDir: 'desc' })
    const [dateFilter, setDateFilter] = useState<string | null>(null)
    const [detailId, setDetailId] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    const [projects, setProjects] = useState<Project[]>([])
    const [selectedProject, setSelectedProject] = useState<string | null>(null)
    const [projectSearch, setProjectSearch] = useState('')

    // Full domain data (unfiltered) for overlay
    const [fullDomainData, setFullDomainData] = useState<DomainPoint[]>([])

    const loadAll = useCallback(async () => {
        setLoading(true)
        try {
            const [appsRes, healthRes, decayRes, domainRes, confRes, feedRes, projectsRes] = await Promise.all([
                getConnectedApps(),
                getCorpusHealth(selectedProject ?? undefined),
                getDecayTimeSeries(decayDays, selectedApp ?? undefined, selectedProject ?? undefined),
                getDomainDistribution(selectedApp ?? undefined, selectedProject ?? undefined),
                getConfidenceDistribution(selectedApp ?? undefined, selectedProject ?? undefined),
                getLearnings({ ...filters, sourceApp: selectedApp, dateFilter, projectId: selectedProject }, feedPage),
                getProjects(),
            ])
            setApps(appsRes)
            setHealth(healthRes)
            setDecayData(decayRes)
            setDomainData(domainRes)
            setConfidenceData(confRes)
            setFeedItems(feedRes.items)
            setFeedTotal(feedRes.total)
            setProjects(projectsRes)

            // If filtered, also get full corpus domain data for overlay
            if (selectedApp) {
                const full = await getDomainDistribution()
                setFullDomainData(full)
            } else {
                setFullDomainData([])
            }
        } catch (err) {
            console.error('Knowledge dashboard load error:', err)
        } finally {
            setLoading(false)
        }
    }, [selectedApp, selectedProject, decayDays, filters, dateFilter, feedPage])

    useEffect(() => {
        loadAll()
    }, [loadAll])

    // Merge full corpus data into domain data for overlay
    const domainWithOverlay: DomainPoint[] = selectedApp
        ? domainData.map(d => ({
            ...d,
            fullCorpus: fullDomainData.find(f => f.domain === d.domain)?.weightedCount ?? 0,
        }))
        : domainData

    const dashboardContent = (
        <div className="p-4 md:p-8 h-full overflow-y-auto w-full max-w-6xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-light text-[var(--hg-text-primary)] tracking-wide">Intelligence</h1>
                    <p className="text-xs font-mono uppercase tracking-widest text-[var(--hg-text-tertiary)] mt-1">Conductor Layer</p>
                </div>

                {/* Project Search */}
                <div className="relative w-64 z-50">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--hg-text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        placeholder="search projects"
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        className="w-full bg-[var(--hg-surface)] border border-[var(--hg-border)] rounded-sm py-1.5 pl-9 pr-3 text-sm text-[var(--hg-text-primary)] focus:outline-none focus:border-[var(--hg-accent)] transition-colors placeholder:text-[var(--hg-text-tertiary)]"
                    />
                    {projectSearch.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--hg-surface)] border border-[var(--hg-border)] rounded-sm shadow-xl max-h-48 overflow-y-auto">
                            {projects.filter(p => p.name.toLowerCase().includes(projectSearch.toLowerCase())).map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => {
                                        setSelectedProject(p.id)
                                        setProjectSearch('')
                                        setFeedPage(1)
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm text-[var(--hg-text-secondary)] hover:bg-[var(--hg-surface-hover)] hover:text-[var(--hg-text-primary)] transition-colors"
                                >
                                    {p.name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Active filter pills */}
            {(selectedApp || dateFilter || selectedProject) && (
                <div className="mb-4 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-[var(--hg-text-secondary)]">Filtering by:</span>
                    {selectedProject && (
                        <button
                            onClick={() => { setSelectedProject(null); setFeedPage(1) }}
                            className="px-2 py-0.5 text-xs font-mono bg-[var(--hg-accent-muted)] text-[var(--hg-accent)] border border-[var(--hg-accent)] hover:bg-[var(--hg-accent)] hover:text-[var(--hg-bg)] transition-colors"
                        >
                            project: {projects.find(p => p.id === selectedProject)?.name ?? selectedProject} ×
                        </button>
                    )}
                    {selectedApp && (
                        <button
                            onClick={() => { setSelectedApp(null); setFeedPage(1) }}
                            className="px-2 py-0.5 text-xs font-mono bg-[var(--hg-accent-muted)] text-[var(--hg-accent)] border border-[var(--hg-accent)] hover:bg-[var(--hg-accent)] hover:text-[var(--hg-bg)] transition-colors"
                        >
                            {selectedApp} ×
                        </button>
                    )}
                    {dateFilter && (
                        <button
                            onClick={() => { setDateFilter(null); setFeedPage(1) }}
                            className="px-2 py-0.5 text-xs font-mono bg-[var(--hg-surface)] text-[var(--hg-text-secondary)] border border-[var(--hg-border)] hover:border-[var(--hg-accent)] hover:text-[var(--hg-accent)] transition-colors"
                        >
                            date: {dateFilter} ×
                        </button>
                    )}
                </div>
            )}

            {loading && !health ? (
                <div className="space-y-4">
                    <div className="h-24 bg-[var(--hg-surface)] border border-[var(--hg-border)] animate-pulse" />
                    <div className="h-16 bg-[var(--hg-surface)] border border-[var(--hg-border)] animate-pulse" />
                    <div className="h-[220px] bg-[var(--hg-surface)] border border-[var(--hg-border)] animate-pulse" />
                </div>
            ) : (
                <>
                    {/* Row 1: Apps + Corpus Health */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8 items-start">
                        <AppRegistryGrid
                            apps={apps}
                            selectedApp={selectedApp}
                            onSelectApp={setSelectedApp}
                        />
                        {health && <CorpusHealthStrip stats={health} />}
                    </div>

                    {/* Row 2: Decay Map (full width) */}
                    <div className="mb-8">
                        <DecayMap
                            data={decayData}
                            currentDays={decayDays}
                            onDaysChange={setDecayDays}
                            onDateClick={(date) => {
                                setDateFilter(date)
                                setFeedPage(1)
                                // Scroll down to the feed
                                setTimeout(() => {
                                    document.getElementById('learning-feed-anchor')?.scrollIntoView({ behavior: 'smooth' })
                                }, 100)
                            }}
                        />
                    </div>

                    {/* Row 3: Domain Radar + Confidence Distribution */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                        <DomainRadar
                            data={domainWithOverlay}
                            hasAppFilter={selectedApp !== null}
                        />
                        {confidenceData && (
                            <ConfidenceBar
                                stats={confidenceData}
                                onItemClick={setDetailId}
                            />
                        )}
                    </div>

                    {/* Row 4: Learning Feed */}
                    <div id="learning-feed-anchor" className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                        <h2 className="text-xs font-mono uppercase tracking-wider text-[var(--hg-text-tertiary)]">
                            Learning Feed
                        </h2>
                        <KnowledgeFilterBar
                            filters={filters}
                            onFiltersChange={(f) => { setFilters(f); setFeedPage(1) }}
                            appFilter={selectedApp}
                        />
                    </div>
                    <LearningFeed
                        items={feedItems}
                        total={feedTotal}
                        page={feedPage}
                        pageSize={25}
                        onPageChange={setFeedPage}
                        onItemClick={setDetailId}
                        onRefresh={loadAll}
                    />
                </>
            )}

            {/* Detail Drawer */}
            <LearningDetailDrawer
                learningId={detailId}
                onClose={() => setDetailId(null)}
                onRefresh={loadAll}
            />
        </div>
    )

    return (
        <ResizableLayout
            left={null}
            center={dashboardContent}
            right={
                <div className="p-4 md:p-8 h-full flex flex-col items-center justify-center text-[var(--hg-text-tertiary)] text-xs font-mono uppercase tracking-widest text-center border-l border-[var(--hg-border)] bg-[var(--hg-bg)]">
                    <p>Integrations Frame</p>
                    <p className="mt-2 text-[10px] opacity-50">Drag edge to expand</p>
                </div>
            }
        />
    )
}
