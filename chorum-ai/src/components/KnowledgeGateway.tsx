'use client'

import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import dynamic from 'next/dynamic'
import { HyggeButton } from '@/components/hygge/HyggeButton'

const KnowledgeGraph = dynamic(
  () => import('@/components/KnowledgeGraph').then(m => m.KnowledgeGraph),
  { ssr: false }
)

interface LearningItem {
  id: string
  projectId: string
  type: string // Dynamic based on domain
  content: string
  context?: string | null
  domains?: string[] | null
  usageCount?: number | null
  pinnedAt?: string | null
  mutedAt?: string | null
  createdAt?: string | null
  metadata?: Record<string, unknown> | null
}

interface ConfidenceMetric {
  score: number
  interactionCount?: number | null
  positiveInteractionCount?: number | null
}

interface FileMetadata {
  id: string
  filePath: string
  linkedInvariants?: string[] | null
}

interface KnowledgeGatewayProps {
  projectId: string
  projectName?: string
  isPro?: boolean
  primaryDomain?: string
}

// Default code domain configuration
const CODE_DOMAIN_LABELS: Record<string, string> = {
  invariant: 'Rule',
  pattern: 'Pattern',
  antipattern: 'Thing to avoid',
  decision: 'Decision',
  golden_path: 'How-to'
}

const CODE_DOMAIN_ORDER = ['invariant', 'pattern', 'antipattern', 'decision', 'golden_path']

// Writing domain configuration
const WRITING_DOMAIN_LABELS: Record<string, string> = {
  character: 'Character',
  setting: 'Setting',
  plot_thread: 'Plot Thread',
  voice: 'Voice',
  world_rule: 'World Rule',
  // Fallbacks for mixed content
  invariant: 'Rule',
  pattern: 'Pattern',
  decision: 'Decision'
}

const WRITING_DOMAIN_ORDER = ['character', 'setting', 'plot_thread', 'voice', 'world_rule', 'invariant', 'pattern', 'decision']

export function KnowledgeGateway({ projectId, projectName, isPro = false, primaryDomain = 'code' }: KnowledgeGatewayProps) {
  const [items, setItems] = useState<LearningItem[]>([])
  const [confidence, setConfidence] = useState<ConfidenceMetric | null>(null)
  const [criticalFiles, setCriticalFiles] = useState<FileMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'gateway' | 'byType' | 'graph'>('gateway')

  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editContext, setEditContext] = useState('')

  const [showAddForm, setShowAddForm] = useState(false)

  // Dynamic configuration based on domain
  const { labels, order, defaultType } = useMemo(() => {
    if (primaryDomain === 'writing') {
      return {
        labels: WRITING_DOMAIN_LABELS,
        order: WRITING_DOMAIN_ORDER,
        defaultType: 'character'
      }
    }
    return {
      labels: CODE_DOMAIN_LABELS,
      order: CODE_DOMAIN_ORDER,
      defaultType: 'invariant'
    }
  }, [primaryDomain])

  const [addType, setAddType] = useState<string>('invariant')
  const [addContent, setAddContent] = useState('')
  const [addContext, setAddContext] = useState('')
  const [saving, setSaving] = useState(false)

  // Reset addType when domain changes
  useEffect(() => {
    setAddType(defaultType)
  }, [defaultType])

  const [analyzingLinks, setAnalyzingLinks] = useState(false)
  const [linkAnalysisResult, setLinkAnalysisResult] = useState<{ success: boolean; message: string } | null>(null)

  const [showCriticalFiles, setShowCriticalFiles] = useState(false)

  useEffect(() => {
    if (projectId) {
      fetchData()
    }
  }, [projectId])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [itemsRes, confidenceRes, filesRes] = await Promise.all([
        fetch(`/api/learning?projectId=${projectId}`),
        fetch(`/api/learning?projectId=${projectId}&confidence=true`),
        fetch(`/api/learning?projectId=${projectId}&criticalFiles=true`)
      ])

      if (itemsRes.ok) {
        const data = await itemsRes.json()
        setItems(data.items || [])
      }
      if (confidenceRes.ok) {
        const data = await confidenceRes.json()
        setConfidence(data.confidence || null)
      }
      if (filesRes.ok) {
        const data = await filesRes.json()
        setCriticalFiles(data.criticalFiles || [])
      }
    } catch (e) {
      console.error('Failed to fetch learning data:', e)
      setError('Failed to load learning data')
    } finally {
      setLoading(false)
    }
  }

  const itemsByType = useMemo(() => {
    return items.reduce((acc, item) => {
      if (!acc[item.type]) acc[item.type] = []
      acc[item.type].push(item)
      return acc
    }, {} as Record<string, LearningItem[]>)
  }, [items])

  const mostActive = useMemo(() => {
    return [...items]
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
      .slice(0, 5)
  }, [items])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this learning item?')) return
    try {
      const res = await fetch(`/api/learning?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== id))
        if (expandedItemId === id) setExpandedItemId(null)
      }
    } catch (e) {
      console.error('Failed to delete:', e)
    }
  }

  const handleEdit = async (id: string) => {
    if (!editContent.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/learning', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          content: editContent,
          context: editContext || null
        })
      })
      if (res.ok) {
        setItems(prev => prev.map(i =>
          i.id === id ? { ...i, content: editContent, context: editContext || null } : i
        ))
        setEditingItemId(null)
      }
    } catch (e) {
      console.error('Failed to update:', e)
    } finally {
      setSaving(false)
    }
  }

  const handleAdd = async () => {
    if (!addContent.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/learning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          type: addType,
          content: addContent,
          context: addContext || undefined
        })
      })
      if (res.ok) {
        const data = await res.json()
        setItems(prev => [...prev, data.item])
        setShowAddForm(false)
        setAddContent('')
        setAddContext('')
      }
    } catch (e) {
      console.error('Failed to add:', e)
    } finally {
      setSaving(false)
    }
  }

  const handlePinMute = async (itemId: string, action: 'pin' | 'unpin' | 'mute' | 'unmute') => {
    try {
      await fetch('/api/conductor/items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, action })
      })
      fetchData()
    } catch (e) {
      console.error('Failed to update item:', e)
    }
  }

  const handleAnalyzeLinks = async () => {
    if (!projectId) return
    setAnalyzingLinks(true)
    setLinkAnalysisResult(null)
    try {
      const res = await fetch('/api/learning/analyze-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      })
      const data = await res.json()
      if (data.success) {
        setLinkAnalysisResult({ success: true, message: data.message })
      } else {
        setLinkAnalysisResult({ success: false, message: data.message || data.error })
      }
    } catch (e: any) {
      setLinkAnalysisResult({ success: false, message: e.message })
    } finally {
      setAnalyzingLinks(false)
    }
  }

  if (loading) {
    return <div className="py-12 text-sm text-[var(--hg-text-tertiary)]">Loading knowledge…</div>
  }

  if (error) {
    return (
      <div className="py-12 text-sm text-red-400">
        {error}{' '}
        <button onClick={fetchData} className="hg-btn hg-btn-accent ml-2">
          retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg text-[var(--hg-text-primary)]">Learned Knowledge</h2>
          {projectName && <p className="text-xs text-[var(--hg-text-tertiary)]">{projectName}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            className={clsx('hg-btn', viewMode === 'gateway' && 'hg-btn-accent')}
            onClick={() => setViewMode('gateway')}
          >
            list view
          </button>
          <button
            className={clsx('hg-btn', viewMode === 'graph' && 'hg-btn-accent')}
            onClick={() => setViewMode('graph')}
          >
            graph view
          </button>
          <HyggeButton variant="accent" onClick={() => setShowAddForm(v => !v)}>
            + add
          </HyggeButton>
        </div>
      </div>

      {showAddForm && (
        <div className="border border-[var(--hg-border)] p-4 bg-[var(--hg-surface)]">
          <div className="grid md:grid-cols-[160px_1fr] gap-4">
            <select
              value={addType}
              onChange={e => setAddType(e.target.value)}
              className="bg-[var(--hg-bg)] border border-[var(--hg-border)] text-[var(--hg-text-primary)] px-3 py-2 text-sm"
            >
              {order.map(type => (
                <option key={type} value={type}>{labels[type] || type}</option>
              ))}
            </select>
            <textarea
              value={addContent}
              onChange={e => setAddContent(e.target.value)}
              className="bg-[var(--hg-bg)] border border-[var(--hg-border)] text-[var(--hg-text-primary)] px-3 py-2 text-sm min-h-[80px]"
              placeholder="Describe the learning…"
            />
          </div>
          <input
            value={addContext}
            onChange={e => setAddContext(e.target.value)}
            className="mt-3 w-full bg-[var(--hg-bg)] border border-[var(--hg-border)] text-[var(--hg-text-primary)] px-3 py-2 text-sm"
            placeholder="Context (optional)"
          />
          <div className="mt-4 flex gap-2">
            <HyggeButton onClick={() => setShowAddForm(false)}>cancel</HyggeButton>
            <HyggeButton variant="accent" loading={saving} onClick={handleAdd} disabled={!addContent.trim()}>
              add item
            </HyggeButton>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {order.map(type => (
          <div key={type} className="hg-stat-line">
            <span className="hg-label">{labels[type] || type}</span>
            <span className="hg-fill" />
            <span className="hg-value">{itemsByType[type]?.length || 0}</span>
          </div>
        ))}
      </div>

      {confidence && (
        <div className="border border-[var(--hg-border)] p-4 bg-[var(--hg-surface)]">
          <div className="text-sm text-[var(--hg-text-secondary)]">Confidence</div>
          <div className="mt-2 h-2 bg-[var(--hg-border)]">
            <div
              className="h-full bg-[var(--hg-accent)]"
              style={{ width: `${Math.min(100, Math.max(0, confidence.score || 0))}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-[var(--hg-text-tertiary)]">
            {confidence.interactionCount || 0} interactions, {confidence.positiveInteractionCount || 0} positive
          </div>
        </div>
      )}

      {viewMode === 'gateway' && (
        <>
          <div className="border-t border-[var(--hg-border)] pt-4">
            <div className="text-sm text-[var(--hg-text-secondary)] mb-3">Most Active</div>
            <div className="space-y-3">
              {mostActive.length === 0 && (
                <div className="text-xs text-[var(--hg-text-tertiary)]">No learnings yet.</div>
              )}
              {mostActive.map(item => {
                const isExpanded = expandedItemId === item.id
                const isPinned = !!item.pinnedAt
                return (
                  <div key={item.id} className="border border-[var(--hg-border)] p-3">
                    <button
                      className="w-full text-left"
                      onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                    >
                      <div className="flex justify-between gap-4">
                        <div className="text-sm text-[var(--hg-text-primary)]">"{item.content}"</div>
                        <div className="text-xs text-[var(--hg-text-tertiary)] tabular-nums">
                          used {item.usageCount || 0}x
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-[var(--hg-text-tertiary)]">
                        {labels[item.type] || item.type}
                        {item.domains?.length ? ` · ${item.domains.join(', ')}` : ''}
                        {isPinned ? ' · pinned' : ''}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="mt-3 text-xs text-[var(--hg-text-tertiary)] space-y-2">
                        {editingItemId === item.id ? (
                          <>
                            <textarea
                              value={editContent}
                              onChange={e => setEditContent(e.target.value)}
                              className="w-full bg-[var(--hg-bg)] border border-[var(--hg-border)] text-[var(--hg-text-primary)] px-3 py-2 text-sm min-h-[70px]"
                            />
                            <input
                              value={editContext}
                              onChange={e => setEditContext(e.target.value)}
                              className="w-full bg-[var(--hg-bg)] border border-[var(--hg-border)] text-[var(--hg-text-primary)] px-3 py-2 text-sm"
                              placeholder="Context (optional)"
                            />
                            <div className="flex gap-2">
                              <HyggeButton onClick={() => setEditingItemId(null)}>cancel</HyggeButton>
                              <HyggeButton variant="accent" loading={saving} onClick={() => handleEdit(item.id)}>
                                save
                              </HyggeButton>
                            </div>
                          </>
                        ) : (
                          <>
                            {item.context && <div>Context: {item.context}</div>}
                            {item.metadata && <div>Metadata: {JSON.stringify(item.metadata)}</div>}
                            <div className="flex gap-2 pt-2">
                              <button className="hg-btn" onClick={() => {
                                setEditingItemId(item.id)
                                setEditContent(item.content)
                                setEditContext(item.context || '')
                              }}>edit</button>
                              <button className="hg-btn hg-btn-destructive" onClick={() => handleDelete(item.id)}>delete</button>
                              <button className="hg-btn hg-btn-accent" onClick={() => handlePinMute(item.id, isPinned ? 'unpin' : 'pin')}>
                                {isPinned ? 'unpin' : 'pin'}
                              </button>
                              <button className="hg-btn" onClick={() => handlePinMute(item.id, item.mutedAt ? 'unmute' : 'mute')}>
                                {item.mutedAt ? 'unmute' : 'mute'}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="border-t border-[var(--hg-border)] pt-4 flex flex-wrap gap-3 items-center justify-between text-sm">
            <div className="text-[var(--hg-text-tertiary)]">
              <button className="hg-btn" onClick={() => setShowCriticalFiles(v => !v)}>
                {criticalFiles.length} critical files tracked
              </button>
              {showCriticalFiles && criticalFiles.length > 0 && (
                <div className="mt-2 text-xs text-[var(--hg-text-tertiary)] space-y-1">
                  {criticalFiles.map(file => (
                    <div key={file.id} className="font-mono">{file.filePath}</div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button className="hg-btn hg-btn-accent" onClick={() => setViewMode('byType')}>
                view all by type →
              </button>
              <button className="hg-btn" onClick={handleAnalyzeLinks} disabled={analyzingLinks}>
                {analyzingLinks ? 'analyzing…' : 'analyze relationships →'}
              </button>
              {linkAnalysisResult && (
                <span className={clsx(
                  'text-xs',
                  linkAnalysisResult.success ? 'text-[var(--hg-accent)]' : 'text-[var(--hg-text-tertiary)]'
                )}>
                  {linkAnalysisResult.message}
                </span>
              )}
            </div>
          </div>
        </>
      )}

      {viewMode === 'byType' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-[var(--hg-text-secondary)]">View by type</div>
            <button className="hg-btn hg-btn-accent" onClick={() => setViewMode('gateway')}>
              ← back to gateway
            </button>
          </div>

          {order.map(type => {
            const typeItems = itemsByType[type] || []
            return (
              <div key={type} className="border border-[var(--hg-border)]">
                <div className="px-4 py-2 border-b border-[var(--hg-border)] text-sm text-[var(--hg-text-secondary)]">
                  {labels[type] || type} · {typeItems.length}
                </div>
                {typeItems.length === 0 ? (
                  <div className="px-4 py-4 text-xs text-[var(--hg-text-tertiary)]">No items yet.</div>
                ) : (
                  <div className="divide-y divide-[var(--hg-border)]">
                    {typeItems.map(item => (
                      <div key={item.id} className="px-4 py-3">
                        <button
                          className="w-full text-left"
                          onClick={() => setExpandedItemId(expandedItemId === item.id ? null : item.id)}
                        >
                          <div className="text-sm text-[var(--hg-text-primary)]">"{item.content}"</div>
                          {item.context && (
                            <div className="text-xs text-[var(--hg-text-tertiary)] mt-1">{item.context}</div>
                          )}
                        </button>
                        {expandedItemId === item.id && (
                          <div className="mt-2 text-xs text-[var(--hg-text-tertiary)]">
                            {editingItemId === item.id ? (
                              <>
                                <textarea
                                  value={editContent}
                                  onChange={e => setEditContent(e.target.value)}
                                  className="w-full bg-[var(--hg-bg)] border border-[var(--hg-border)] text-[var(--hg-text-primary)] px-3 py-2 text-sm min-h-[70px]"
                                />
                                <input
                                  value={editContext}
                                  onChange={e => setEditContext(e.target.value)}
                                  className="w-full bg-[var(--hg-bg)] border border-[var(--hg-border)] text-[var(--hg-text-primary)] px-3 py-2 text-sm mt-2"
                                  placeholder="Context (optional)"
                                />
                                <div className="flex gap-2 pt-2">
                                  <HyggeButton onClick={() => setEditingItemId(null)}>cancel</HyggeButton>
                                  <HyggeButton variant="accent" loading={saving} onClick={() => handleEdit(item.id)}>
                                    save
                                  </HyggeButton>
                                </div>
                              </>
                            ) : (
                              <div className="flex gap-2 pt-2">
                                <button className="hg-btn" onClick={() => {
                                  setEditingItemId(item.id)
                                  setEditContent(item.content)
                                  setEditContext(item.context || '')
                                }}>edit</button>
                                <button className="hg-btn hg-btn-destructive" onClick={() => handleDelete(item.id)}>delete</button>
                                <button className="hg-btn hg-btn-accent" onClick={() => handlePinMute(item.id, item.pinnedAt ? 'unpin' : 'pin')}>
                                  {item.pinnedAt ? 'unpin' : 'pin'}
                                </button>
                                <button className="hg-btn" onClick={() => handlePinMute(item.id, item.mutedAt ? 'unmute' : 'mute')}>
                                  {item.mutedAt ? 'unmute' : 'mute'}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {viewMode === 'graph' && (
        <div className="space-y-4">
          {!isPro && (
            <div className="border border-[var(--hg-border)] p-4 text-sm text-[var(--hg-text-tertiary)]">
              Knowledge graph visualization available on Pro plan.
            </div>
          )}
          <div className={clsx(!isPro && 'opacity-40 pointer-events-none')}>
            <KnowledgeGraph projectId={projectId} />
          </div>
          <button className="hg-btn hg-btn-accent" onClick={() => setViewMode('gateway')}>
            ← back to gateway
          </button>
        </div>
      )}
    </div>
  )
}
