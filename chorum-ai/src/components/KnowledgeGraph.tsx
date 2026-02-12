'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import cytoscape, { type Core } from 'cytoscape'
import clsx from 'clsx'

interface GraphNode {
  id: string
  type: string
  content: string
  domains: string[]
  usageCount: number
  pinnedAt: string | null
  mutedAt: string | null
  lastUsedAt: string | null
  createdAt: string | null
}

interface GraphEdge {
  id: string
  source: string
  target: string
  edgeType: 'link' | 'cooccurrence'
  linkType?: string
  strength: number
  count?: number
}

interface KnowledgeGraphProps {
  projectId: string
  onNodeAction?: (nodeId: string, action: 'pin' | 'mute' | 'edit') => void
}

const graphStyle = [
  {
    selector: 'node',
    style: {
      'background-color': '#333',
      'label': 'data(label)',
      'font-size': '10px',
      'color': '#888',
      'text-valign': 'bottom',
      'text-margin-y': 6,
      'width': 'mapData(usageCount, 0, 50, 16, 48)',
      'height': 'mapData(usageCount, 0, 50, 16, 48)',
      'border-width': 1,
      'border-color': '#444'
    }
  },
  { selector: '.invariant', style: { 'background-color': '#555', 'border-color': '#777' } },
  { selector: '.pattern', style: { 'background-color': '#444' } },
  { selector: '.antipattern', style: { 'background-color': '#333', 'border-style': 'dashed' } },
  { selector: '.decision', style: { 'background-color': '#3a3a3a' } },
  { selector: '.golden_path', style: { 'background-color': '#4a4a4a' } },
  { selector: '[pinnedAt]', style: { 'border-color': '#29ABE2', 'border-width': 2 } },
  { selector: ':selected', style: { 'background-color': '#29ABE2', 'color': '#f4f4f5' } },
  { selector: 'edge.link', style: { 'line-color': '#444', 'width': 'mapData(strength, 0, 1, 0.5, 3)', 'curve-style': 'bezier' } },
  { selector: 'edge.cooccurrence', style: { 'line-color': '#333', 'line-style': 'dashed', 'width': 'mapData(count, 1, 20, 0.5, 2)' } },
  { selector: 'edge[linkType=\"contradicts\"]', style: { 'line-color': '#dc2626', 'line-style': 'dashed' } },
]

export function KnowledgeGraph({ projectId, onNodeAction }: KnowledgeGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cyRef = useRef<Core | null>(null)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [decayDays, setDecayDays] = useState<7 | 30 | 90>(30)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchGraph = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/learning/graph?projectId=${projectId}`)
        if (!res.ok) throw new Error('Failed to load graph')
        const data = await res.json()
        setNodes(data.nodes || [])
        setEdges(data.edges || [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load graph')
      } finally {
        setLoading(false)
      }
    }
    if (projectId) fetchGraph()
  }, [projectId])

  const elements = useMemo(() => {
    const nodeElements = nodes.map(n => ({
      data: {
        id: n.id,
        label: n.content.length > 60 ? `${n.content.slice(0, 60)}…` : n.content,
        usageCount: n.usageCount || 0,
        pinnedAt: n.pinnedAt || undefined,
        type: n.type
      },
      classes: n.type
    }))
    const edgeElements = edges.map(e => ({
      data: {
        id: e.id,
        source: e.source,
        target: e.target,
        strength: e.strength,
        count: e.count || 0,
        linkType: e.linkType || undefined
      },
      classes: e.edgeType
    }))
    return [...nodeElements, ...edgeElements]
  }, [nodes, edges])

  useEffect(() => {
    if (!containerRef.current) return
    if (cyRef.current) {
      cyRef.current.destroy()
      cyRef.current = null
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: graphStyle as any,
      layout: { name: 'cose', animate: false }
    })

    cy.on('tap', 'node', (evt) => {
      const nodeId = evt.target.id()
      const nodeData = nodes.find(n => n.id === nodeId) || null
      setSelectedNode(nodeData)
    })

    cyRef.current = cy
    applyDecay(cy, decayDays, nodes)

    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [elements, nodes])

  useEffect(() => {
    if (cyRef.current) {
      applyDecay(cyRef.current, decayDays, nodes)
    }
  }, [decayDays, nodes])

  const applyDecay = (cy: Core, days: number, allNodes: GraphNode[]) => {
    const now = Date.now()
    const cutoff = now - days * 24 * 60 * 60 * 1000
    cy.batch(() => {
      cy.nodes().forEach(n => {
        const nodeId = n.id()
        const node = allNodes.find(item => item.id === nodeId)
        if (!node?.lastUsedAt) {
          n.style('opacity', 1)
          return
        }
        const age = new Date(node.lastUsedAt).getTime()
        n.style('opacity', age < cutoff ? 0.2 : 1)
      })
    })
  }

  const connectedNodes = useMemo(() => {
    if (!selectedNode) return []
    const connectedIds = edges
      .filter(e => e.source === selectedNode.id || e.target === selectedNode.id)
      .map(e => e.source === selectedNode.id ? e.target : e.source)
    return nodes.filter(n => connectedIds.includes(n.id))
  }, [selectedNode, edges, nodes])

  const handleAction = async (action: 'pin' | 'unpin' | 'mute') => {
    if (!selectedNode) return
    try {
      await fetch('/api/conductor/items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: selectedNode.id, action })
      })
      onNodeAction?.(selectedNode.id, action === 'mute' ? 'mute' : 'pin')
    } catch (e) {
      console.error('Failed to update node:', e)
    }
  }

  if (loading) {
    return <div className="text-xs text-[var(--hg-text-tertiary)]">Loading graph…</div>
  }

  if (error) {
    return <div className="text-xs text-red-400">{error}</div>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-[var(--hg-text-tertiary)]">
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDecayDays(d as 7 | 30 | 90)}
              className={clsx('hg-btn', decayDays === d && 'hg-btn-accent')}
            >
              {d}d
            </button>
          ))}
        </div>
        <div>
          {nodes.length} nodes, {edges.length} connections
        </div>
      </div>

      <div className="grid md:grid-cols-[1.4fr_0.6fr] gap-4">
        <div className="border border-[var(--hg-border)] bg-[var(--hg-surface)] min-h-[520px]">
          <div ref={containerRef} className="w-full h-full min-h-[520px]" />
        </div>
        <div className="border border-[var(--hg-border)] bg-[var(--hg-surface)] p-4 text-sm text-[var(--hg-text-secondary)] space-y-3">
          <div className="text-xs uppercase tracking-wide text-[var(--hg-text-tertiary)]">Node Detail</div>
          {!selectedNode && (
            <div className="text-xs text-[var(--hg-text-tertiary)]">Select a node to see details.</div>
          )}
          {selectedNode && (
            <>
              <div className="text-[var(--hg-text-primary)]">{selectedNode.content}</div>
              <div className="text-xs text-[var(--hg-text-tertiary)]">
                {selectedNode.type} · used {selectedNode.usageCount || 0}x
              </div>
              {selectedNode.domains?.length > 0 && (
                <div className="text-xs text-[var(--hg-text-tertiary)]">
                  Domains: {selectedNode.domains.join(', ')}
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button className="hg-btn" onClick={() => handleAction(selectedNode.pinnedAt ? 'unpin' : 'pin')}>
                  {selectedNode.pinnedAt ? 'unpin' : 'pin'}
                </button>
                <button className="hg-btn" onClick={() => handleAction('mute')}>mute</button>
              </div>
              {connectedNodes.length > 0 && (
                <div className="pt-3">
                  <div className="text-xs uppercase tracking-wide text-[var(--hg-text-tertiary)] mb-2">Connected</div>
                  <div className="space-y-1 text-xs text-[var(--hg-text-tertiary)]">
                    {connectedNodes.map(n => (
                      <div key={n.id}>→ {n.content.length > 40 ? `${n.content.slice(0, 40)}…` : n.content}</div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
