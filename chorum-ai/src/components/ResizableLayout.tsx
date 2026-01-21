'use client'

import { ReactNode } from 'react'
import { Panel, Group, Separator } from 'react-resizable-panels'

interface ResizableLayoutProps {
    left: ReactNode
    center: ReactNode
    right: ReactNode
    leftDefaultSize?: number
    rightDefaultSize?: number
    leftMinSize?: number
    rightMinSize?: number
}

/**
 * ResizableLayout - 3-panel layout with draggable resize handles
 * 
 * Uses react-resizable-panels for smooth resizing with localStorage persistence.
 */
export function ResizableLayout({
    left,
    center,
    right,
    leftDefaultSize = 15,
    rightDefaultSize = 20,
    leftMinSize = 10,
    rightMinSize = 12,
}: ResizableLayoutProps) {
    return (
        <Group
            orientation="horizontal"
            className="h-screen"
        >
            {/* Left Panel - Conversations */}
            <Panel
                defaultSize={leftDefaultSize}
                minSize={leftMinSize}
                maxSize={30}
                className="bg-[#0A0A0A]"
            >
                {left}
            </Panel>

            {/* Resize Handle */}
            <Separator className="w-1 bg-[#1E1E1E] hover:bg-[#4FC3F7] transition-colors cursor-col-resize" />

            {/* Center Panel - Chat */}
            <Panel minSize={40} className="bg-[#141414]">
                {center}
            </Panel>

            {/* Resize Handle */}
            <Separator className="w-1 bg-[#1E1E1E] hover:bg-[#4FC3F7] transition-colors cursor-col-resize" />

            {/* Right Panel - Agents */}
            <Panel
                defaultSize={rightDefaultSize}
                minSize={rightMinSize}
                maxSize={35}
                className="bg-[#0A0A0A]"
            >
                {right}
            </Panel>
        </Group>
    )
}
