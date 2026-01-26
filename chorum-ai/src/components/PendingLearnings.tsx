'use client'

import { useState, useEffect } from 'react'
import { Check, X, Edit2, Clock, Bot } from 'lucide-react'

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

const TYPE_LABELS: Record<string, { icon: string; color: string }> = {
  pattern: { icon: '🧩', color: 'text-blue-400' },
  antipattern: { icon: '⚠️', color: 'text-yellow-400' },
  decision: { icon: '📐', color: 'text-purple-400' },
  invariant: { icon: '🔒', color: 'text-red-400' },
  goldenPath: { icon: '✨', color: 'text-emerald-400' }
}

const SOURCE_STYLES: Record<string, string> = {
  'claude-code': 'bg-purple-900/30 text-purple-400',
  'cursor': 'bg-blue-900/30 text-blue-400',
  'windsurf': 'bg-cyan-900/30 text-cyan-400',
  'h4x0r': 'bg-emerald-900/30 text-emerald-400'
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
      <div className="flex items-center gap-2 text-gray-500 text-sm py-2">
        <Clock className="w-4 h-4 animate-pulse" />
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
        <h3 className="text-sm font-medium text-gray-300 flex items-center gap-2">
          <Bot className="w-4 h-4 text-emerald-400" />
          Pending Learnings
          <span className="bg-emerald-900/30 text-emerald-400 px-2 py-0.5 rounded-full text-xs">
            {items.length}
          </span>
        </h3>
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto">
        {items.map(item => {
          const typeInfo = TYPE_LABELS[item.type] || { icon: '📝', color: 'text-gray-400' }
          const sourceStyle = SOURCE_STYLES[item.source] || 'bg-gray-900/30 text-gray-400'

          return (
            <div
              key={item.id}
              className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-base">{typeInfo.icon}</span>
                    <span className={`text-xs font-medium capitalize ${typeInfo.color}`}>
                      {item.type}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${sourceStyle}`}>
                      {item.source}
                    </span>
                    {item.projectName && (
                      <span className="text-xs text-gray-500">
                        in {item.projectName}
                      </span>
                    )}
                    <span className="text-xs text-gray-500 ml-auto">
                      {new Date(item.createdAt).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* Content */}
                  {editing === item.id ? (
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm text-gray-200 resize-none focus:outline-none focus:border-emerald-500"
                      rows={3}
                    />
                  ) : (
                    <p className="text-sm text-gray-200 line-clamp-3">{item.content}</p>
                  )}

                  {/* Context */}
                  {item.context && !editing && (
                    <p className="text-xs text-gray-500 mt-2 italic border-l-2 border-gray-700 pl-2">
                      {item.context}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {processing === item.id ? (
                    <div className="p-1.5">
                      <Clock className="w-4 h-4 text-gray-400 animate-spin" />
                    </div>
                  ) : editing === item.id ? (
                    <>
                      <button
                        onClick={() => handleAction(item.id, 'approve', editContent)}
                        className="p-1.5 bg-emerald-900/50 hover:bg-emerald-800/50 rounded text-emerald-400 transition-colors"
                        title="Save & Approve"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-400 transition-colors"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditing(item.id)
                          setEditContent(item.content)
                        }}
                        className="p-1.5 hover:bg-gray-700 rounded text-gray-400 transition-colors"
                        title="Edit before approving"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleAction(item.id, 'approve')}
                        className="p-1.5 hover:bg-emerald-900/50 rounded text-emerald-400 transition-colors"
                        title="Approve"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleAction(item.id, 'deny')}
                        className="p-1.5 hover:bg-red-900/50 rounded text-red-400 transition-colors"
                        title="Deny"
                      >
                        <X className="w-4 h-4" />
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
