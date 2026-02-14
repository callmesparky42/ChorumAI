'use client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from './CodeBlock'
import { CollapsibleList } from './CollapsibleContent'
import { Bot, User, DollarSign, Copy, Check, Pin, Cpu, Clock, ChevronDown, ChevronRight } from 'lucide-react'
import { PeerReview } from './PeerReview'
import { useReviewStore } from '@/lib/review/store'
import { useChorumStore } from '@/lib/store'
import { ReviewProvider } from '@/lib/review/types'
import { useState, useEffect, Children, ReactNode } from 'react'

interface MessageProps {
    message: {
        id: string
        role: string
        content: string
        images?: string[] | null
        attachments?: { type: string; name: string; content: string }[] | null
        provider?: string | null
        model?: string | null
        costUsd?: string | null
        tokensInput?: number | null
        tokensOutput?: number | null
        agentName?: string
        agentIcon?: string
        agentRole?: string
        createdAt?: string
    }
    previousUserMessage?: string
    projectId?: string
}

const formatTime = (dateStr?: string) => {
    if (!dateStr) return ''
    try {
        return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch (e) {
        return ''
    }
}

const formatTokens = (input?: number | null, output?: number | null) => {
    if (!input && !output) return null
    const total = (input || 0) + (output || 0)
    if (total < 1000) return `${total}`
    return `${(total / 1000).toFixed(1)}k`
}

export function Message({ message, previousUserMessage, projectId }: MessageProps) {
    const isUser = message.role === 'user'
    const { config, reviews, requestReview, clearReview, isReviewPending } = useReviewStore()
    const { settings } = useChorumStore()
    const [hasAutoReviewed, setHasAutoReviewed] = useState(false)

    const review = reviews[message.id] || null
    const isPending = isReviewPending(message.id)
    const [copied, setCopied] = useState(false)
    const [pinning, setPinning] = useState(false)
    const [pinned, setPinned] = useState(false)

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(message.content)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error('Failed to copy:', err)
        }
    }

    const handlePinToProject = async () => {
        if (!projectId || pinning) return
        setPinning(true)
        try {
            const res = await fetch('/api/learnings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    type: 'pattern',
                    content: message.content,
                    context: previousUserMessage || 'Manually pinned from conversation',
                    source: 'web-ui'
                })
            })
            if (res.ok) {
                setPinned(true)
                setTimeout(() => setPinned(false), 3000)
            } else {
                console.error('Failed to pin:', await res.text())
            }
        } catch (err) {
            console.error('Failed to pin:', err)
        } finally {
            setPinning(false)
        }
    }

    const handleRequestReview = () => {
        if (!previousUserMessage || !message.provider) return
        requestReview({
            messageId: message.id,
            originalTask: previousUserMessage,
            response: message.content,
            responseProvider: message.provider as ReviewProvider,
            projectId,
            agentName: message.agentName,
            agentRole: message.agentRole
        })
    }

    const tokenDisplay = formatTokens(message.tokensInput, message.tokensOutput)

    return (
        <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isUser ? 'bg-blue-600' : 'bg-gray-800 border border-gray-700'}`}>
                {isUser ? (
                    <User className="w-4 h-4" />
                ) : (
                    <Bot className="w-4 h-4" />
                )}
            </div>

            <div className={`flex flex-col max-w-[85%] min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
                {/* Metadata Bar - ABOVE assistant messages */}
                {!isUser && (
                    <div className="flex items-center gap-2 mb-1.5 px-1 text-[10px] text-gray-500">
                        {message.agentName && (
                            <span className="font-medium text-gray-400">{message.agentName}</span>
                        )}
                        {message.provider && (
                            <span className="flex items-center gap-0.5 bg-gray-800/50 px-1.5 py-0.5 rounded" title={message.model || undefined}>
                                <Cpu className="w-2.5 h-2.5" />
                                <span className="capitalize">{message.provider}</span>
                                {message.model && (
                                    <span className="text-gray-500 ml-0.5 border-l border-gray-700 pl-1 max-w-[100px] truncate">
                                        {message.model}
                                    </span>
                                )}
                            </span>
                        )}
                        {tokenDisplay && (
                            <span className="text-gray-600">{tokenDisplay} tokens</span>
                        )}
                        {message.createdAt && (
                            <span className="flex items-center gap-0.5 text-gray-600">
                                <Clock className="w-2.5 h-2.5" />
                                {formatTime(message.createdAt)}
                            </span>
                        )}
                        {settings.showCost && message.costUsd && (
                            <span className="flex items-center gap-0.5 text-emerald-600">
                                <DollarSign className="w-2.5 h-2.5" />
                                {Number(message.costUsd).toFixed(5)}
                            </span>
                        )}
                    </div>
                )}

                {/* User timestamp */}
                {isUser && message.createdAt && (
                    <div className="flex items-center gap-1 mb-1 px-1 text-[10px] text-gray-600">
                        <Clock className="w-2.5 h-2.5" />
                        {formatTime(message.createdAt)}
                    </div>
                )}

                {/* Message Card */}
                <div className={`rounded-xl overflow-hidden ${isUser
                    ? 'bg-blue-600/10 text-blue-100 border border-blue-600/20 px-4 py-2.5'
                    : 'bg-gray-900/80 text-gray-100 border border-gray-800'
                    }`}>

                    {/* Content */}
                    <div className={`prose prose-invert prose-sm max-w-none overflow-x-auto [&>pre]:overflow-x-auto [&_code]:break-all [&_code]:whitespace-pre-wrap ${!isUser ? 'px-4 py-3' : ''}`}>
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                                // @ts-ignore
                                code({ node, inline, className, children, ...props }) {
                                    const match = /language-(\w+)/.exec(className || '')
                                    if (!inline && match) {
                                        return (
                                            <CodeBlock className={className} {...props}>
                                                {children}
                                            </CodeBlock>
                                        )
                                    }
                                    return (
                                        <code
                                            className={`${className || ''} bg-gray-950/50 rounded ${!inline ? 'block overflow-x-auto p-3' : 'px-1.5 py-0.5 text-[13px]'}`}
                                            {...props}
                                        >
                                            {children}
                                        </code>
                                    )
                                },
                                // @ts-ignore
                                pre({ children, ...props }) {
                                    return (
                                        <pre className="!bg-transparent !p-0 !m-0 !overflow-visible" {...props}>
                                            {children}
                                        </pre>
                                    )
                                },
                                // Card-style sections for headers
                                // @ts-ignore
                                h1({ children, ...props }) {
                                    return (
                                        <h1 className="text-lg font-semibold text-white border-b border-gray-700 pb-2 mb-3 mt-4 first:mt-0" {...props}>
                                            {children}
                                        </h1>
                                    )
                                },
                                // @ts-ignore
                                h2({ children, ...props }) {
                                    return (
                                        <h2 className="text-base font-semibold text-gray-200 border-b border-gray-800 pb-1.5 mb-2 mt-4 first:mt-0" {...props}>
                                            {children}
                                        </h2>
                                    )
                                },
                                // @ts-ignore
                                h3({ children, ...props }) {
                                    return (
                                        <h3 className="text-sm font-semibold text-gray-300 mb-1.5 mt-3 first:mt-0" {...props}>
                                            {children}
                                        </h3>
                                    )
                                },
                                // Compact paragraphs
                                // @ts-ignore
                                p({ children, ...props }) {
                                    return (
                                        <p className="mb-2 last:mb-0 leading-relaxed" {...props}>
                                            {children}
                                        </p>
                                    )
                                },
                                // Collapsible lists for long content
                                // @ts-ignore
                                ul({ children, ...props }) {
                                    const items = Children.toArray(children).filter(Boolean)
                                    if (items.length > 3) {
                                        return (
                                            <CollapsibleList
                                                threshold={3}
                                                ordered={false}
                                                className="my-2 ml-4 space-y-1 list-disc marker:text-gray-600"
                                            >
                                                {items}
                                            </CollapsibleList>
                                        )
                                    }
                                    return (
                                        <ul className="my-2 ml-4 space-y-1 list-disc marker:text-gray-600" {...props}>
                                            {children}
                                        </ul>
                                    )
                                },
                                // @ts-ignore
                                ol({ children, ...props }) {
                                    const items = Children.toArray(children).filter(Boolean)
                                    if (items.length > 3) {
                                        return (
                                            <CollapsibleList
                                                threshold={3}
                                                ordered={true}
                                                className="my-2 ml-4 space-y-1 list-decimal marker:text-gray-500"
                                            >
                                                {items}
                                            </CollapsibleList>
                                        )
                                    }
                                    return (
                                        <ol className="my-2 ml-4 space-y-1 list-decimal marker:text-gray-500" {...props}>
                                            {children}
                                        </ol>
                                    )
                                },
                                // @ts-ignore
                                li({ children, ...props }) {
                                    return (
                                        <li className="leading-relaxed" {...props}>
                                            {children}
                                        </li>
                                    )
                                },
                                // Blockquotes as callout cards
                                // @ts-ignore
                                blockquote({ children, ...props }) {
                                    return (
                                        <blockquote className="border-l-2 border-blue-500/50 bg-blue-500/5 pl-3 py-1 my-2 text-gray-300 italic" {...props}>
                                            {children}
                                        </blockquote>
                                    )
                                }
                            }}
                        >
                            {message.content}
                        </ReactMarkdown>
                    </div>

                    {/* Attachments */}
                    {((message.images?.length || 0) > 0 || (message.attachments?.length || 0) > 0) && (
                        <div className={`flex flex-wrap gap-2 border-t border-gray-800/50 ${!isUser ? 'px-4 py-2' : 'pt-2 mt-2'}`}>
                            {message.images?.map((img, idx) => (
                                <div key={`img-${idx}`} className="relative group max-w-xs rounded-lg overflow-hidden border border-gray-700/50">
                                    <img src={img} alt="attached" className="max-h-48 object-contain cursor-zoom-in hover:brightness-110 transition-all" onClick={() => window.open(img, '_blank')} />
                                </div>
                            ))}
                            {message.attachments?.filter(a => a.type !== 'image').map((att, idx) => (
                                <div key={`att-${idx}`} className="flex items-center gap-2 px-2 py-1.5 bg-gray-800/50 rounded border border-gray-700/50 text-xs text-gray-400">
                                    <span className="font-mono bg-gray-900 px-1 rounded uppercase text-[9px]">{att.type}</span>
                                    <span className="truncate max-w-[120px]" title={att.name}>{att.name}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Action Bar - Inside card for assistant messages */}
                    {!isUser && (
                        <div className="flex items-center gap-1 px-3 py-1.5 border-t border-gray-800/50 bg-gray-950/30">
                            <button
                                onClick={handleCopy}
                                className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
                                title="Copy message"
                            >
                                {copied ? (
                                    <>
                                        <Check className="w-3 h-3 text-emerald-500" />
                                        <span className="text-emerald-500">Copied</span>
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-3 h-3" />
                                        <span>Copy</span>
                                    </>
                                )}
                            </button>

                            {projectId && (
                                <button
                                    onClick={handlePinToProject}
                                    disabled={pinning || pinned}
                                    className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-500 hover:text-amber-400 hover:bg-gray-800 rounded transition-colors disabled:opacity-50"
                                    title="Pin to Project (save as learning)"
                                >
                                    {pinned ? (
                                        <>
                                            <Pin className="w-3 h-3 text-amber-500" />
                                            <span className="text-amber-500">Pinned</span>
                                        </>
                                    ) : pinning ? (
                                        <>
                                            <Pin className="w-3 h-3 animate-pulse" />
                                            <span>Pinning...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Pin className="w-3 h-3" />
                                            <span>Pin to Project</span>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Peer Review section */}
                {!isUser && config.enabled && (
                    <PeerReview
                        review={review}
                        isLoading={isPending}
                        onRequestReview={!review && !isPending && previousUserMessage ? handleRequestReview : undefined}
                        onDismiss={review ? () => clearReview(message.id) : undefined}
                    />
                )}
            </div>
        </div>
    )
}
