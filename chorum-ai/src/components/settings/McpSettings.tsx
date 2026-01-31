'use client'

import { useState, useEffect } from 'react'
import { Copy, Trash2, Plus, Key, Terminal, AlertCircle, Pencil, Check, X } from 'lucide-react'

interface Token {
  id: string
  name: string
  permissions: {
    read: boolean
    write: boolean
    projects: string[] | 'all'
  }
  lastUsedAt: string | null
  createdAt: string
}

export function McpSettings() {
  const [tokens, setTokens] = useState<Token[]>([])
  const [newToken, setNewToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  useEffect(() => {
    fetchTokens()
  }, [])

  async function fetchTokens() {
    try {
      const res = await fetch('/api/settings/tokens')
      const data = await res.json()
      setTokens(data.tokens || [])
    } catch (error) {
      console.error('Failed to fetch tokens:', error)
    } finally {
      setLoading(false)
    }
  }

  async function createToken() {
    setCreating(true)
    try {
      const res = await fetch('/api/settings/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'MCP Token' })
      })
      const data = await res.json()
      setNewToken(data.token)
      fetchTokens()
    } catch (error) {
      console.error('Failed to create token:', error)
    } finally {
      setCreating(false)
    }
  }

  async function revokeToken(tokenId: string) {
    try {
      await fetch('/api/settings/tokens', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId })
      })
      fetchTokens()
    } catch (error) {
      console.error('Failed to revoke token:', error)
    }
  }

  async function renameToken(tokenId: string, newName: string) {
    try {
      await fetch('/api/settings/tokens', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId, name: newName })
      })
      setEditingId(null)
      fetchTokens()
    } catch (error) {
      console.error('Failed to rename token:', error)
    }
  }

  function startEditing(token: Token) {
    setEditingId(token.id)
    setEditName(token.name)
  }

  function cancelEditing() {
    setEditingId(null)
    setEditName('')
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const mcpConfig = `{
  "mcpServers": {
    "chorum": {
      "url": "${typeof window !== 'undefined' ? window.location.origin : 'https://chorum.ai'}/api/mcp",
      "headers": {
        "Authorization": "Bearer ${newToken || 'YOUR_TOKEN_HERE'}"
      }
    }
  }
}`

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-emerald-900/30 rounded-lg">
          <Terminal className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-lg font-medium text-white">MCP Integration</h3>
          <p className="text-sm text-gray-400">
            Connect external AI agents (Claude Code, Cursor, etc.) to your ChorumAI memory.
          </p>
        </div>
      </div>

      {/* Token display after creation */}
      {newToken && (
        <div className="bg-emerald-900/30 border border-emerald-700 rounded-lg p-4">
          <div className="flex items-start gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-emerald-400 mt-0.5" />
            <p className="text-emerald-400 text-sm">
              Token created! Copy it now - you won't see it again.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-black/30 px-3 py-2 rounded text-sm font-mono text-emerald-300 overflow-x-auto">
              {newToken}
            </code>
            <button
              onClick={() => copyToClipboard(newToken)}
              className="p-2 hover:bg-emerald-800/50 rounded transition-colors"
              title="Copy token"
            >
              <Copy className={`w-4 h-4 ${copied ? 'text-emerald-300' : 'text-emerald-400'}`} />
            </button>
          </div>
          {copied && (
            <p className="text-xs text-emerald-500 mt-2">Copied to clipboard!</p>
          )}
        </div>
      )}

      {/* Token list */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <Key className="w-4 h-4" />
            API Tokens
          </h4>
          <button
            onClick={createToken}
            disabled={creating}
            className="flex items-center gap-1 text-sm text-emerald-400 hover:text-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            {creating ? 'Creating...' : 'New Token'}
          </button>
        </div>

        {loading ? (
          <div className="text-gray-500 text-sm py-4">Loading tokens...</div>
        ) : tokens.length === 0 ? (
          <div className="text-gray-500 text-sm py-4 bg-gray-800/30 rounded-lg text-center">
            No tokens yet. Create one to get started with MCP integration.
          </div>
        ) : (
          <div className="space-y-2">
            {tokens.map(token => (
              <div
                key={token.id}
                className="flex items-center justify-between bg-gray-800/50 rounded-lg px-4 py-3 border border-gray-700/50"
              >
                <div className="flex-1 min-w-0">
                  {editingId === token.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="flex-1 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-emerald-500"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') renameToken(token.id, editName)
                          if (e.key === 'Escape') cancelEditing()
                        }}
                      />
                      <button
                        onClick={() => renameToken(token.id, editName)}
                        className="p-1 hover:bg-emerald-900/30 rounded text-emerald-400 transition-colors"
                        title="Save"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={cancelEditing}
                        className="p-1 hover:bg-gray-700 rounded text-gray-400 transition-colors"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-white">{token.name}</p>
                      <p className="text-xs text-gray-500">
                        {token.lastUsedAt
                          ? `Last used: ${new Date(token.lastUsedAt).toLocaleDateString()}`
                          : 'Never used'}
                        {' • '}
                        Created: {new Date(token.createdAt).toLocaleDateString()}
                      </p>
                    </>
                  )}
                </div>
                {editingId !== token.id && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEditing(token)}
                      className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
                      title="Rename token"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => revokeToken(token.id)}
                      className="p-2 hover:bg-red-900/30 rounded text-gray-400 hover:text-red-400 transition-colors"
                      title="Revoke token"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MCP Config */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-300">IDE Configuration</h4>
        <p className="text-xs text-gray-500">Add this to your IDE's MCP settings:</p>
        <div className="relative">
          <pre className="bg-gray-900 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto border border-gray-700/50">
            {mcpConfig}
          </pre>
          <button
            onClick={() => copyToClipboard(mcpConfig)}
            className="absolute top-2 right-2 p-2 hover:bg-gray-700 rounded transition-colors"
            title="Copy configuration"
          >
            <Copy className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Supported IDEs */}
      <div className="text-xs text-gray-500 space-y-1">
        <p className="font-medium text-gray-400">Supported IDEs:</p>
        <ul className="list-disc list-inside space-y-0.5 ml-2">
          <li>Claude Desktop (claude_desktop_config.json)</li>
          <li>Cursor (settings.json → mcpServers)</li>
          <li>Windsurf (settings.json → mcpServers)</li>
          <li>VS Code + Continue extension</li>
          <li>Gemini Code Assist (Antigravity)</li>
        </ul>
      </div>
    </div>
  )
}

