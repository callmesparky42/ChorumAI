'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { ChatPanel } from '@/components/ChatPanel'
import { ContextPanel } from '@/components/ContextPanel'

export default function ChorumPage() {
  const [activeProject, setActiveProject] = useState<{ id: string, name: string } | null>({ id: '1', name: 'Chorum AI Build' }) // Default to project 1

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      {/* Sidebar - 256px */}
      <Sidebar
        activeProject={activeProject}
        onSelectProject={setActiveProject}
      />

      {/* Chat - flex-1 */}
      <ChatPanel projectId={activeProject?.id} />

      {/* Context - 320px */}
      {/* @ts-ignore */}
      <ContextPanel activeProject={activeProject} />
    </div>
  )
}
