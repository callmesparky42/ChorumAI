'use client'

import { ReactNode, useState, useCallback, useRef, useEffect } from 'react'

interface ResizableLayoutProps {
    left: ReactNode
    center: ReactNode
    right: ReactNode
    rightCollapsed?: boolean
}

const MIN_SIDE_PANEL = 15  // percent
const MAX_SIDE_PANEL = 40  // percent
const DEFAULT_SIDE = 25    // percent

/**
 * ResizableLayout - 3-panel layout with draggable resize handles
 *
 * Only the center panel edges are draggable.
 * Left handle adjusts left panel width, right handle adjusts right panel width.
 * Center panel is always: 100% - leftWidth - rightWidth
 */
export function ResizableLayout({ left, center, right, rightCollapsed = false }: ResizableLayoutProps) {
    const [leftWidth, setLeftWidth] = useState(DEFAULT_SIDE)
    const [rightWidth, setRightWidth] = useState(DEFAULT_SIDE)
    const [savedRightWidth, setSavedRightWidth] = useState(DEFAULT_SIDE)
    const containerRef = useRef<HTMLDivElement>(null)

    // Handle collapse state changes
    useEffect(() => {
        if (rightCollapsed) {
            setSavedRightWidth(prev => rightWidth > 0 ? rightWidth : prev)
            setRightWidth(0)
        } else {
            setRightWidth(savedRightWidth > 0 ? savedRightWidth : DEFAULT_SIDE)
        }
    }, [rightCollapsed])
    const draggingRef = useRef<'left' | 'right' | null>(null)

    const handleMouseDown = useCallback((handle: 'left' | 'right') => {
        draggingRef.current = handle
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
    }, [])

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!draggingRef.current || !containerRef.current) return

        const rect = containerRef.current.getBoundingClientRect()
        const containerWidth = rect.width
        const mouseX = e.clientX - rect.left
        const percent = (mouseX / containerWidth) * 100

        if (draggingRef.current === 'left') {
            // Clamp left panel width
            const newLeft = Math.min(MAX_SIDE_PANEL, Math.max(MIN_SIDE_PANEL, percent))
            // Ensure center doesn't go below minimum (at least 20%)
            const minCenter = 20
            if (newLeft + rightWidth <= 100 - minCenter) {
                setLeftWidth(newLeft)
            }
        } else if (draggingRef.current === 'right') {
            // Right panel: calculate from right edge
            const newRight = Math.min(MAX_SIDE_PANEL, Math.max(MIN_SIDE_PANEL, 100 - percent))
            // Ensure center doesn't go below minimum
            const minCenter = 20
            if (leftWidth + newRight <= 100 - minCenter) {
                setRightWidth(newRight)
            }
        }
    }, [leftWidth, rightWidth])

    const handleMouseUp = useCallback(() => {
        draggingRef.current = null
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
    }, [])

    useEffect(() => {
        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
        return () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }
    }, [handleMouseMove, handleMouseUp])

    const centerWidth = 100 - leftWidth - rightWidth

    return (
        <div ref={containerRef} className="flex h-screen w-full">
            {/* Left Panel */}
            <div
                className="bg-[#0A0A0A] overflow-hidden flex-shrink-0"
                style={{ width: `${leftWidth}%` }}
            >
                {left}
            </div>

            {/* Left Resize Handle */}
            <div
                onMouseDown={() => handleMouseDown('left')}
                className="w-1 bg-[#1E1E1E] hover:bg-[#4FC3F7] transition-colors cursor-col-resize flex-shrink-0"
            />

            {/* Center Panel */}
            <div
                className="bg-[#141414] overflow-hidden flex-shrink-0 flex flex-col"
                style={{ width: `${centerWidth}%` }}
            >
                {center}
            </div>

            {/* Right Resize Handle */}
            {!rightCollapsed && (
                <div
                    onMouseDown={() => handleMouseDown('right')}
                    className="w-1 bg-[#1E1E1E] hover:bg-[#4FC3F7] transition-colors cursor-col-resize flex-shrink-0"
                />
            )}

            {/* Right Panel */}
            <div
                className="bg-[#0A0A0A] overflow-hidden flex-shrink-0"
                style={{ width: `${rightWidth}%` }}
            >
                {right}
            </div>
        </div>
    )
}
