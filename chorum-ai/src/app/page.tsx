'use client'

import { Suspense, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'
import { ChatPanel } from '@/components/ChatPanel'
import { AgentPanel } from '@/components/AgentPanel'
import { useChorumStore } from '@/lib/store'

function ChorumContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeProjectId = searchParams.get('project')
  const { loadConversation, startNewConversation } = useChorumStore()

  const handleSelectProject = useCallback((projectId: string) => {
    const params = new URLSearchParams(searchParams)
    params.set('project', projectId)
    // Start a new conversation when switching projects
    startNewConversation()
    router.push(`/?${params.toString()}`)
  }, [router, searchParams, startNewConversation])

  const handleSelectConversation = useCallback((conversationId: string) => {
    loadConversation(conversationId)
  }, [loadConversation])

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      {/* Sidebar - 256px */}
      <Sidebar
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        onSelectConversation={handleSelectConversation}
      />

      {/* Chat - flex-1 */}
      <ChatPanel projectId={activeProjectId || undefined} />

      {/* Agent Panel - 320px */}
      <AgentPanel projectId={activeProjectId || undefined} />
    </div>
  )
}

export default function ChorumPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-gray-950 flex items-center justify-center text-gray-500">Loading...</div>}>
      <ChorumContent />
    </Suspense>
  )
}
