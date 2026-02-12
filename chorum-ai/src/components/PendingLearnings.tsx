'use client'

import { useState, useEffect } from 'react'

interface PendingItem {
  id: string
  projectId: string
  projectName: string | null
  type: string
  content: string
  context: string | null
  source: string
  createdAt: string
}

const TYPE_LABELS: Record<string, { label: string }> = {
  pattern: { label: 'Pattern' },
  antipattern: { label: 'Thing to avoid' },
  decision: { label: 'Decision' },
  invariant: { label: 'Rule' },
  goldenPath: { label: 'How-to' }
}

export function PendingLearnings() {
  const [items, setItems] = useState<PendingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [processing, setProcessing] = useState<string | null>(null)

  useEffect(() => {
    fetchPending()
    // Poll for new items every 30 seconds
    const interval = setInterval(fetchPending, 30000)
    return () => clearInterval(interval)
  }, [])

  async function fetchPending() {
    try {
      const res = await fetch('/api/learnings/pending')
      const data = await res.json()
      setItems(data.pending || [])
    } catch (error) {
      console.error('Failed to fetch pending learnings:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleAction(id: string, action: 'approve' | 'deny', editedContent?: string) {
    setProcessing(id)
    try {
      await fetch('/api/learnings/pending', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, editedContent })
      })
      setEditing(null)
      fetchPending()
    } catch (error) {
      console.error('Failed to process learning:', error)
    } finally {
      setProcessing(null)
    }
  }

  if (loading) {
    return (
      <div className="text-[var(--hg-text-tertiary)] text-sm py-2">
        Loading pending learnings...
      </div>
    )
  }

  if (items.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--hg-text-secondary)]">
          Pending Learnings
        </h3>
        <span className="text-xs text-[var(--hg-accent)] border border-[var(--hg-accent)] px-2 py-0.5">
          {items.length}
        </span>
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto">
        {items.map(item => {
          const typeInfo = TYPE_LABELS[item.type] || { label: item.type }

          return (
            <div
              key={item.id}
              className="bg-[var(--hg-surface)] p-3 border border-[var(--hg-border)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-xs font-medium text-[var(--hg-text-secondary)]">
                      {typeInfo.label}
                    </span>
                    <span className="text-xs px-2 py-0.5 border border-[var(--hg-border)] text-[var(--hg-text-tertiary)]">
                      {item.source}
                    </span>
                    {item.projectName && (
                      <span className="text-xs text-[var(--hg-text-tertiary)]">
                        in {item.projectName}
                      </span>
                    )}
                    <span className="text-xs text-[var(--hg-text-tertiary)] ml-auto">
                      {new Date(item.createdAt).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* Content */}
                  {editing === item.id ? (
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full bg-[var(--hg-bg)] border border-[var(--hg-border)] p-2 text-sm text-[var(--hg-text-primary)] resize-none focus:outline-none"
                      rows={3}
                    />
                  ) : (
                    <p className="text-sm text-[var(--hg-text-primary)] line-clamp-3">{item.content}</p>
                  )}

                  {/* Context */}
                  {item.context && !editing && (
                    <p className="text-xs text-[var(--hg-text-tertiary)] mt-2 border-l-2 border-[var(--hg-border)] pl-2">
                      {item.context}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {processing === item.id ? (
                    <div className="text-xs text-[var(--hg-text-tertiary)]">Processing…</div>
                  ) : editing === item.id ? (
                    <>
                      <button
                        onClick={() => handleAction(item.id, 'approve', editContent)}
                        className="hg-btn hg-btn-accent text-xs"
                        title="Save & Approve"
                      >
                        save
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="hg-btn text-xs"
                        title="Cancel"
                      >
                        cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditing(item.id)
                          setEditContent(item.content)
                        }}
                        className="hg-btn text-xs"
                        title="Edit before approving"
                      >
                        edit
                      </button>
                      <button
                        onClick={() => handleAction(item.id, 'approve')}
                        className="hg-btn hg-btn-accent text-xs"
                        title="Approve"
                      >
                        approve
                      </button>
                      <button
                        onClick={() => handleAction(item.id, 'deny')}
                        className="hg-btn hg-btn-destructive text-xs"
                        title="Deny"
                      >
                        deny
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
