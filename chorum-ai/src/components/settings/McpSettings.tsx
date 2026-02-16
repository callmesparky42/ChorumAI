'use client'

import { useState, useEffect, useRef } from 'react'
import { HyggeButton } from '@/components/hygge/HyggeButton'
import QRCode from 'qrcode'

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
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    fetchTokens()
  }, [])

  useEffect(() => {
    if (newToken && qrCanvasRef.current) {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://chorum.ai'
      const payload = `chorum://connect?url=${encodeURIComponent(origin)}&token=${encodeURIComponent(newToken)}`
      QRCode.toCanvas(qrCanvasRef.current, payload, {
        width: 96,
        margin: 1,
        color: { dark: '#e0e0e0', light: '#00000000' }
      })
    }
  }, [newToken])

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
      <div>
        <h3 className="text-lg font-medium text-[var(--hg-text-primary)]">MCP Integration</h3>
        <p className="text-sm text-[var(--hg-text-secondary)]">
          Connect external AI agents (Claude Code, Cursor, etc.) to your ChorumAI memory.
        </p>
      </div>

      {/* Token display after creation */}
      {newToken && (
        <div className="bg-[var(--hg-surface)] border border-[var(--hg-border)] p-4">
          <p className="text-[var(--hg-accent)] text-sm mb-2">
            Token created. Copy it now - you will not see it again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-[var(--hg-bg)] px-3 py-2 text-sm font-mono text-[var(--hg-text-primary)] overflow-x-auto border border-[var(--hg-border)]">
              {newToken}
            </code>
            <HyggeButton onClick={() => copyToClipboard(newToken)} className="text-xs">
              {copied ? 'copied' : 'copy'}
            </HyggeButton>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <canvas ref={qrCanvasRef} className="shrink-0" />
            <p className="text-xs text-[var(--hg-text-tertiary)]">
              Scan with the Chorum mobile app to connect automatically.
            </p>
          </div>
        </div>
      )}

      {/* Token list */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h4 className="text-sm font-medium text-[var(--hg-text-secondary)]">API Tokens</h4>
          <HyggeButton onClick={createToken} disabled={creating} variant="accent" className="text-xs">
            {creating ? 'Creating...' : 'New Token'}
          </HyggeButton>
        </div>

        {loading ? (
          <div className="text-[var(--hg-text-tertiary)] text-sm py-4">Loading tokens...</div>
        ) : tokens.length === 0 ? (
          <div className="text-[var(--hg-text-tertiary)] text-sm py-4 bg-[var(--hg-bg)] border border-[var(--hg-border)] text-center">
            No tokens yet. Create one to get started with MCP integration.
          </div>
        ) : (
          <div className="space-y-2">
            {tokens.map(token => (
              <div
                key={token.id}
                className="flex items-center justify-between bg-[var(--hg-surface)] px-4 py-3 border border-[var(--hg-border)]"
              >
                <div className="flex-1 min-w-0">
                  {editingId === token.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="flex-1 bg-[var(--hg-bg)] border border-[var(--hg-border)] px-2 py-1 text-sm text-[var(--hg-text-primary)] focus:outline-none"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') renameToken(token.id, editName)
                          if (e.key === 'Escape') cancelEditing()
                        }}
                      />
                      <HyggeButton onClick={() => renameToken(token.id, editName)} className="text-xs">
                        save
                      </HyggeButton>
                      <HyggeButton onClick={cancelEditing} className="text-xs">
                        cancel
                      </HyggeButton>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-[var(--hg-text-primary)]">{token.name}</p>
                      <p className="text-xs text-[var(--hg-text-tertiary)]">
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
                    <HyggeButton onClick={() => startEditing(token)} className="text-xs">rename</HyggeButton>
                    <HyggeButton onClick={() => revokeToken(token.id)} variant="destructive" className="text-xs">revoke</HyggeButton>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MCP Config */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-[var(--hg-text-secondary)]">IDE Configuration</h4>
        <p className="text-xs text-[var(--hg-text-tertiary)]">Add this to your IDE's MCP settings:</p>
        <div className="relative">
          <pre className="bg-[var(--hg-bg)] p-4 text-xs text-[var(--hg-text-secondary)] overflow-x-auto border border-[var(--hg-border)]">
            {mcpConfig}
          </pre>
          <div className="absolute top-2 right-2">
            <HyggeButton onClick={() => copyToClipboard(mcpConfig)} className="text-xs">
              copy
            </HyggeButton>
          </div>
        </div>
      </div>

      {/* Supported IDEs */}
      <div className="text-xs text-[var(--hg-text-tertiary)] space-y-1">
        <p className="font-medium text-[var(--hg-text-secondary)]">Supported IDEs:</p>
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

