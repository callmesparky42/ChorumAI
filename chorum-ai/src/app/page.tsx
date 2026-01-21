'use client'

import { Suspense, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'
import { ChatPanel } from '@/components/ChatPanel'
import { AgentPanel } from '@/components/AgentPanel'
import { ResizableLayout } from '@/components/ResizableLayout'
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
    <div className="h-screen bg-[#0A0A0A] text-[#F5F5F5] overflow-hidden">
      <ResizableLayout
        left={
          <Sidebar
            activeProjectId={activeProjectId}
            onSelectProject={handleSelectProject}
            onSelectConversation={handleSelectConversation}
          />
        }
        center={<ChatPanel projectId={activeProjectId || undefined} />}
        right={<AgentPanel projectId={activeProjectId || undefined} />}
      />
    </div>
  )
}

export default function ChorumPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-[#0A0A0A] flex items-center justify-center text-[#737373]">Loading...</div>}>
      <ChorumContent />
    </Suspense>
  )
}

