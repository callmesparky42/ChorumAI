'use client'

import { useState, useEffect } from 'react'
import { HyggeButton } from '@/components/hygge/HyggeButton'

interface McpServer {
  id: string
  name: string
  transportType: 'stdio' | 'http' | 'sse'
  command?: string | null
  args?: string[] | null
  url?: string | null
  isEnabled: boolean
  cachedTools?: { name: string; description?: string }[] | null
  lastToolRefresh?: string | null
}

export function McpServersSettings() {
  const [servers, setServers] = useState<McpServer[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [expandedServer, setExpandedServer] = useState<string | null>(null)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formTransport, setFormTransport] = useState<'stdio' | 'http'>('http')
  const [formUrl, setFormUrl] = useState('')
  const [formCommand, setFormCommand] = useState('npx')
  const [formArgs, setFormArgs] = useState('')
  const [formEnvKey, setFormEnvKey] = useState('')
  const [formEnvValue, setFormEnvValue] = useState('')
  const [formEnvVars, setFormEnvVars] = useState<Record<string, string>>({})
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchServers()
  }, [])

  async function fetchServers() {
    try {
      const res = await fetch('/api/mcp-servers')
      if (res.ok) {
        const data = await res.json()
        setServers(data.servers || [])
      }
    } catch (error) {
      console.error('Failed to fetch MCP servers:', error)
    } finally {
      setLoading(false)
    }
  }

  async function addServer() {
    if (!formName) return
    if (formTransport === 'http' && !formUrl) return
    if (formTransport === 'stdio' && !formCommand) return

    setCreating(true)
    try {
      const body: Record<string, unknown> = {
        name: formName,
        transportType: formTransport
      }

      if (formTransport === 'http') {
        body.url = formUrl
      } else {
        body.command = formCommand
        body.args = formArgs.split(' ').filter(a => a.trim())
        if (Object.keys(formEnvVars).length > 0) {
          body.env = formEnvVars
        }
      }

      const res = await fetch('/api/mcp-servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (res.ok) {
        resetForm()
        fetchServers()
      }
    } catch (error) {
      console.error('Failed to add MCP server:', error)
    } finally {
      setCreating(false)
    }
  }

  async function deleteServer(id: string) {
    try {
      const res = await fetch('/api/mcp-servers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      if (res.ok) {
        fetchServers()
      }
    } catch (error) {
      console.error('Failed to delete MCP server:', error)
    }
  }

  async function toggleServer(id: string, enabled: boolean) {
    try {
      const res = await fetch('/api/mcp-servers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isEnabled: enabled })
      })
      if (res.ok) {
        setServers(servers.map(s => s.id === id ? { ...s, isEnabled: enabled } : s))
      }
    } catch (error) {
      console.error('Failed to toggle MCP server:', error)
    }
  }

  async function refreshTools(id: string) {
    setRefreshingId(id)
    try {
      const res = await fetch(`/api/mcp-servers/${id}/tools`, {
        method: 'POST'
      })
      if (res.ok) {
        fetchServers()
      }
    } catch (error) {
      console.error('Failed to refresh tools:', error)
    } finally {
      setRefreshingId(null)
    }
  }

  function resetForm() {
    setFormName('')
    setFormTransport('http')
    setFormUrl('')
    setFormCommand('npx')
    setFormArgs('')
    setFormEnvVars({})
    setFormEnvKey('')
    setFormEnvValue('')
    setShowAddForm(false)
  }

  function addEnvVar() {
    if (formEnvKey && formEnvValue) {
      setFormEnvVars({ ...formEnvVars, [formEnvKey]: formEnvValue })
      setFormEnvKey('')
      setFormEnvValue('')
    }
  }

  function removeEnvVar(key: string) {
    const newVars = { ...formEnvVars }
    delete newVars[key]
    setFormEnvVars(newVars)
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-[var(--hg-border)] w-1/3"></div>
        <div className="h-20 bg-[var(--hg-surface)] border border-[var(--hg-border)]"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-[var(--hg-text-primary)]">External MCP Servers</h3>
          <p className="text-sm text-[var(--hg-text-secondary)]">
            Connect to MCP servers to add tools like web search, APIs, and more.
          </p>
        </div>
        <HyggeButton variant="accent" onClick={() => setShowAddForm(!showAddForm)} className="text-sm">
          Add Server
        </HyggeButton>
      </div>

      {/* Add Server Form */}
      {showAddForm && (
        <div className="bg-[var(--hg-surface)] p-4 border border-[var(--hg-border)] space-y-4">
          <h4 className="text-[var(--hg-text-primary)] font-medium">Add MCP Server</h4>

          {/* Server Name */}
          <div>
            <label className="block text-sm text-[var(--hg-text-secondary)] mb-1">Server Name</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g., Brave Search"
              className="w-full bg-[var(--hg-bg)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-primary)] placeholder-[var(--hg-text-tertiary)] focus:outline-none"
            />
          </div>

          {/* Transport Type */}
          <div>
            <label className="block text-sm text-[var(--hg-text-secondary)] mb-1">Transport Type</label>
            <div className="flex gap-2">
              <button
                onClick={() => setFormTransport('http')}
                className={`px-4 py-2 text-sm transition-colors border ${formTransport === 'http'
                    ? 'bg-[var(--hg-accent-muted)] border-[var(--hg-accent)] text-[var(--hg-accent)]'
                    : 'bg-[var(--hg-bg)] border-[var(--hg-border)] text-[var(--hg-text-secondary)] hover:border-[var(--hg-border-subtle)]'
                  }`}
              >
                HTTP/SSE
              </button>
              <button
                onClick={() => setFormTransport('stdio')}
                className={`px-4 py-2 text-sm transition-colors border ${formTransport === 'stdio'
                    ? 'bg-[var(--hg-accent-muted)] border-[var(--hg-accent)] text-[var(--hg-accent)]'
                    : 'bg-[var(--hg-bg)] border-[var(--hg-border)] text-[var(--hg-text-secondary)] hover:border-[var(--hg-border-subtle)]'
                  }`}
              >
                Stdio (Local)
              </button>
            </div>
          </div>

          {/* HTTP Config */}
          {formTransport === 'http' && (
            <div>
              <label className="block text-sm text-[var(--hg-text-secondary)] mb-1">Server URL</label>
              <input
                type="text"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="https://your-mcp-server.com/mcp"
                className="w-full bg-[var(--hg-bg)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-primary)] placeholder-[var(--hg-text-tertiary)] focus:outline-none"
              />
            </div>
          )}

          {/* Stdio Config */}
          {formTransport === 'stdio' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-[var(--hg-text-secondary)] mb-1">Command</label>
                  <input
                    type="text"
                    value={formCommand}
                    onChange={(e) => setFormCommand(e.target.value)}
                    placeholder="npx"
                    className="w-full bg-[var(--hg-bg)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-primary)] placeholder-[var(--hg-text-tertiary)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[var(--hg-text-secondary)] mb-1">Arguments</label>
                  <input
                    type="text"
                    value={formArgs}
                    onChange={(e) => setFormArgs(e.target.value)}
                    placeholder="-y @anthropic-ai/brave-search-mcp"
                    className="w-full bg-[var(--hg-bg)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-primary)] placeholder-[var(--hg-text-tertiary)] focus:outline-none"
                  />
                </div>
              </div>

              {/* Environment Variables */}
              <div>
                <label className="block text-sm text-[var(--hg-text-secondary)] mb-1">Environment Variables</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={formEnvKey}
                    onChange={(e) => setFormEnvKey(e.target.value)}
                    placeholder="BRAVE_API_KEY"
                    className="flex-1 bg-[var(--hg-bg)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-primary)] placeholder-[var(--hg-text-tertiary)] focus:outline-none text-sm"
                  />
                  <input
                    type="password"
                    value={formEnvValue}
                    onChange={(e) => setFormEnvValue(e.target.value)}
                    placeholder="Value"
                    className="flex-1 bg-[var(--hg-bg)] border border-[var(--hg-border)] px-3 py-2 text-[var(--hg-text-primary)] placeholder-[var(--hg-text-tertiary)] focus:outline-none text-sm"
                  />
                  <HyggeButton onClick={addEnvVar} className="text-xs">add</HyggeButton>
                </div>
                {Object.entries(formEnvVars).length > 0 && (
                  <div className="space-y-1">
                    {Object.entries(formEnvVars).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between bg-[var(--hg-bg)] border border-[var(--hg-border)] px-3 py-1.5 text-sm">
                        <span className="text-[var(--hg-text-secondary)]">{key}=***</span>
                        <HyggeButton onClick={() => removeEnvVar(key)} variant="destructive" className="text-xs">
                          remove
                        </HyggeButton>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <HyggeButton
              variant="accent"
              onClick={addServer}
              disabled={creating || !formName || (formTransport === 'http' && !formUrl) || (formTransport === 'stdio' && !formCommand)}
              className="text-sm"
            >
              {creating ? 'Adding...' : 'Add Server'}
            </HyggeButton>
            <HyggeButton onClick={resetForm} className="text-sm">
              Cancel
            </HyggeButton>
          </div>
        </div>
      )}

      {/* Server List */}
      {servers.length === 0 ? (
        <div className="text-center py-8 text-[var(--hg-text-tertiary)] border border-dashed border-[var(--hg-border)]">
          <p>No MCP servers configured yet.</p>
          <p className="text-sm mt-1">Add a server to enable tools like web search.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {servers.map(server => (
            <div key={server.id} className="bg-[var(--hg-surface)] border border-[var(--hg-border)] overflow-hidden">
              {/* Server Header */}
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleServer(server.id, !server.isEnabled)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${server.isEnabled ? 'bg-[var(--hg-accent)]' : 'bg-[var(--hg-border-subtle)]'
                      }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${server.isEnabled ? 'translate-x-5' : 'translate-x-1'
                        }`}
                    />
                  </button>
                  <div>
                    <h4 className="text-[var(--hg-text-primary)] font-medium">
                      {server.name}
                    </h4>
                    <p className="text-xs text-[var(--hg-text-tertiary)]">
                      {server.transportType === 'stdio'
                        ? `${server.command} ${server.args?.join(' ') || ''}`
                        : server.url
                      }
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {server.cachedTools && (
                    <span className="text-xs text-[var(--hg-text-tertiary)] px-2 py-1 border border-[var(--hg-border)]">
                      {server.cachedTools.length} tools
                    </span>
                  )}
                  <HyggeButton
                    onClick={() => refreshTools(server.id)}
                    disabled={refreshingId === server.id}
                    className="text-xs"
                  >
                    {refreshingId === server.id ? 'refreshing…' : 'refresh'}
                  </HyggeButton>
                  <HyggeButton
                    onClick={() => setExpandedServer(expandedServer === server.id ? null : server.id)}
                    className="text-xs"
                  >
                    {expandedServer === server.id ? 'hide' : 'details'}
                  </HyggeButton>
                  <HyggeButton
                    onClick={() => deleteServer(server.id)}
                    variant="destructive"
                    className="text-xs"
                  >
                    delete
                  </HyggeButton>
                </div>
              </div>

              {/* Expanded Tools List */}
              {expandedServer === server.id && server.cachedTools && server.cachedTools.length > 0 && (
                <div className="border-t border-[var(--hg-border)] p-4">
                  <h5 className="text-sm text-[var(--hg-text-secondary)] mb-2">Available Tools:</h5>
                  <div className="space-y-2">
                    {server.cachedTools.map((tool, i) => (
                      <div key={i} className="bg-[var(--hg-bg)] border border-[var(--hg-border)] px-3 py-2">
                        <div className="text-[var(--hg-text-primary)] text-sm font-mono">{tool.name}</div>
                        {tool.description && (
                          <div className="text-[var(--hg-text-tertiary)] text-xs mt-0.5">{tool.description}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Info Box */}
      <div className="bg-[var(--hg-bg)] border border-[var(--hg-border)] p-4">
        <h4 className="text-[var(--hg-text-primary)] font-medium mb-2">Popular MCP Servers</h4>
        <ul className="text-sm text-[var(--hg-text-secondary)] space-y-1">
          <li><strong>Brave Search:</strong> <code className="text-[var(--hg-text-primary)]">npx -y @anthropic-ai/brave-search-mcp</code> (requires BRAVE_API_KEY)</li>
          <li><strong>Fetch:</strong> <code className="text-[var(--hg-text-primary)]">npx -y @anthropic-ai/fetch-mcp</code> (URL fetching)</li>
          <li><strong>Filesystem:</strong> <code className="text-[var(--hg-text-primary)]">npx -y @anthropic-ai/filesystem-mcp</code> (local file access)</li>
        </ul>
      </div>
    </div>
  )
}
