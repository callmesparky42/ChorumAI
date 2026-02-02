'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, RefreshCw, Server, Check, X, ChevronDown, ChevronUp, Globe, Terminal } from 'lucide-react'

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
        <div className="h-6 bg-gray-700 rounded w-1/3"></div>
        <div className="h-20 bg-gray-800 rounded"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Server className="w-5 h-5 text-blue-400" />
          <div>
            <h3 className="text-lg font-medium text-white">External MCP Servers</h3>
            <p className="text-sm text-gray-400">
              Connect to MCP servers to add tools like web search, APIs, and more.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Server
        </button>
      </div>

      {/* Add Server Form */}
      {showAddForm && (
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50 space-y-4">
          <h4 className="text-white font-medium">Add MCP Server</h4>

          {/* Server Name */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Server Name</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g., Brave Search"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Transport Type */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Transport Type</label>
            <div className="flex gap-2">
              <button
                onClick={() => setFormTransport('http')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                  formTransport === 'http'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <Globe className="w-4 h-4" />
                HTTP/SSE
              </button>
              <button
                onClick={() => setFormTransport('stdio')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                  formTransport === 'stdio'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <Terminal className="w-4 h-4" />
                Stdio (Local)
              </button>
            </div>
          </div>

          {/* HTTP Config */}
          {formTransport === 'http' && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Server URL</label>
              <input
                type="text"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="https://your-mcp-server.com/mcp"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          )}

          {/* Stdio Config */}
          {formTransport === 'stdio' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Command</label>
                  <input
                    type="text"
                    value={formCommand}
                    onChange={(e) => setFormCommand(e.target.value)}
                    placeholder="npx"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Arguments</label>
                  <input
                    type="text"
                    value={formArgs}
                    onChange={(e) => setFormArgs(e.target.value)}
                    placeholder="-y @anthropic-ai/brave-search-mcp"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Environment Variables */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Environment Variables</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={formEnvKey}
                    onChange={(e) => setFormEnvKey(e.target.value)}
                    placeholder="BRAVE_API_KEY"
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
                  />
                  <input
                    type="password"
                    value={formEnvValue}
                    onChange={(e) => setFormEnvValue(e.target.value)}
                    placeholder="Value"
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
                  />
                  <button
                    onClick={addEnvVar}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {Object.entries(formEnvVars).length > 0 && (
                  <div className="space-y-1">
                    {Object.entries(formEnvVars).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between bg-gray-900 rounded px-3 py-1.5 text-sm">
                        <span className="text-gray-300">{key}=***</span>
                        <button onClick={() => removeEnvVar(key)} className="text-gray-500 hover:text-red-400">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={addServer}
              disabled={creating || !formName || (formTransport === 'http' && !formUrl) || (formTransport === 'stdio' && !formCommand)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
            >
              {creating ? 'Adding...' : 'Add Server'}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Server List */}
      {servers.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <Server className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No MCP servers configured yet.</p>
          <p className="text-sm mt-1">Add a server to enable tools like web search.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {servers.map(server => (
            <div key={server.id} className="bg-gray-800/50 rounded-lg border border-gray-700/50 overflow-hidden">
              {/* Server Header */}
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleServer(server.id, !server.isEnabled)}
                    className={`w-10 h-6 rounded-full transition-colors relative ${
                      server.isEnabled ? 'bg-green-600' : 'bg-gray-600'
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        server.isEnabled ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <div>
                    <h4 className="text-white font-medium flex items-center gap-2">
                      {server.name}
                      {server.transportType === 'stdio' ? (
                        <Terminal className="w-3.5 h-3.5 text-gray-500" />
                      ) : (
                        <Globe className="w-3.5 h-3.5 text-gray-500" />
                      )}
                    </h4>
                    <p className="text-xs text-gray-500">
                      {server.transportType === 'stdio'
                        ? `${server.command} ${server.args?.join(' ') || ''}`
                        : server.url
                      }
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {server.cachedTools && (
                    <span className="text-xs text-gray-400 px-2 py-1 bg-gray-700/50 rounded">
                      {server.cachedTools.length} tools
                    </span>
                  )}
                  <button
                    onClick={() => refreshTools(server.id)}
                    disabled={refreshingId === server.id}
                    className="p-2 text-gray-400 hover:text-white transition-colors"
                    title="Refresh tools"
                  >
                    <RefreshCw className={`w-4 h-4 ${refreshingId === server.id ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={() => setExpandedServer(expandedServer === server.id ? null : server.id)}
                    className="p-2 text-gray-400 hover:text-white transition-colors"
                  >
                    {expandedServer === server.id ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => deleteServer(server.id)}
                    className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Expanded Tools List */}
              {expandedServer === server.id && server.cachedTools && server.cachedTools.length > 0 && (
                <div className="border-t border-gray-700/50 p-4">
                  <h5 className="text-sm text-gray-400 mb-2">Available Tools:</h5>
                  <div className="space-y-2">
                    {server.cachedTools.map((tool, i) => (
                      <div key={i} className="bg-gray-900/50 rounded px-3 py-2">
                        <div className="text-white text-sm font-mono">{tool.name}</div>
                        {tool.description && (
                          <div className="text-gray-500 text-xs mt-0.5">{tool.description}</div>
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
      <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4">
        <h4 className="text-blue-300 font-medium mb-2">Popular MCP Servers</h4>
        <ul className="text-sm text-blue-200/80 space-y-1">
          <li><strong>Brave Search:</strong> <code className="text-blue-300">npx -y @anthropic-ai/brave-search-mcp</code> (requires BRAVE_API_KEY)</li>
          <li><strong>Fetch:</strong> <code className="text-blue-300">npx -y @anthropic-ai/fetch-mcp</code> (URL fetching)</li>
          <li><strong>Filesystem:</strong> <code className="text-blue-300">npx -y @anthropic-ai/filesystem-mcp</code> (local file access)</li>
        </ul>
      </div>
    </div>
  )
}
