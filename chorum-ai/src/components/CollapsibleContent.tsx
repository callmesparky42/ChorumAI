'use client'

import { useState, useRef, useEffect, ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import clsx from 'clsx'

interface CollapsibleContentProps {
    children: ReactNode
    previewLines?: number
    className?: string
    label?: string
}

/**
 * Collapsible wrapper for long content sections.
 * Shows a preview with "Show more" toggle.
 */
export function CollapsibleContent({
    children,
    previewLines = 3,
    className,
    label
}: CollapsibleContentProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [needsCollapse, setNeedsCollapse] = useState(false)
    const contentRef = useRef<HTMLDivElement>(null)
    const previewRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (contentRef.current && previewRef.current) {
            const fullHeight = contentRef.current.scrollHeight
            const previewHeight = previewRef.current.scrollHeight
            // If content is significantly taller than preview, enable collapse
            setNeedsCollapse(fullHeight > previewHeight * 1.5)
        }
    }, [children])

    if (!needsCollapse) {
        return <div className={className}>{children}</div>
    }

    return (
        <div className={clsx("relative", className)}>
            {/* Preview container */}
            <div
                ref={previewRef}
                className={clsx(
                    "overflow-hidden transition-all duration-200",
                    !isExpanded && "max-h-[4.5em]" // ~3 lines
                )}
            >
                <div ref={contentRef}>
                    {children}
                </div>
            </div>

            {/* Fade overlay when collapsed */}
            {!isExpanded && (
                <div className="absolute bottom-6 left-0 right-0 h-8 bg-gradient-to-t from-gray-900/90 to-transparent pointer-events-none" />
            )}

            {/* Toggle button */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 mt-1 transition-colors"
            >
                {isExpanded ? (
                    <>
                        <ChevronDown className="w-3 h-3" />
                        <span>Show less</span>
                    </>
                ) : (
                    <>
                        <ChevronRight className="w-3 h-3" />
                        <span>{label || 'Show more'}</span>
                    </>
                )}
            </button>
        </div>
    )
}

interface CollapsibleListProps {
    children: ReactNode[]
    threshold?: number
    ordered?: boolean
    className?: string
}

/**
 * Collapsible list that shows first N items with "Show N more" toggle.
 */
export function CollapsibleList({
    children,
    threshold = 2,
    ordered = false,
    className
}: CollapsibleListProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const items = Array.isArray(children) ? children : [children]
    const needsCollapse = items.length > threshold

    if (!needsCollapse) {
        const ListTag = ordered ? 'ol' : 'ul'
        return (
            <ListTag className={className}>
                {children}
            </ListTag>
        )
    }

    const visibleItems = isExpanded ? items : items.slice(0, threshold)
    const hiddenCount = items.length - threshold
    const ListTag = ordered ? 'ol' : 'ul'

    return (
        <div>
            <ListTag className={className}>
                {visibleItems}
            </ListTag>
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 ml-4 mt-1 transition-colors"
            >
                {isExpanded ? (
                    <>
                        <ChevronDown className="w-3 h-3" />
                        <span>Show less</span>
                    </>
                ) : (
                    <>
                        <ChevronRight className="w-3 h-3" />
                        <span>Show {hiddenCount} more item{hiddenCount !== 1 ? 's' : ''}</span>
                    </>
                )}
            </button>
        </div>
    )
}

interface CollapsibleSectionProps {
    title: ReactNode
    children: ReactNode
    defaultExpanded?: boolean
    level?: 1 | 2 | 3
}

/**
 * Collapsible section with header toggle.
 * Great for long explanations under headers.
 */
export function CollapsibleSection({
    title,
    children,
    defaultExpanded = true,
    level = 2
}: CollapsibleSectionProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded)

    const headerStyles = {
        1: "text-lg font-semibold text-white",
        2: "text-base font-semibold text-gray-200",
        3: "text-sm font-semibold text-gray-300"
    }

    return (
        <div className="my-2">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={clsx(
                    "flex items-center gap-2 w-full text-left hover:opacity-80 transition-opacity",
                    headerStyles[level]
                )}
            >
                {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
                ) : (
                    <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                )}
                <span className="flex-1">{title}</span>
            </button>
            {isExpanded && (
                <div className="ml-6 mt-2">
                    {children}
                </div>
            )}
        </div>
    )
}
