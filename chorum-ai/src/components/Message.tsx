'use client'
import ReactMarkdown from 'react-markdown'
import { Bot, User, DollarSign, Copy, Check } from 'lucide-react'
import { PeerReview } from './PeerReview'
import { useReviewStore } from '@/lib/review/store'
import { useChorumStore } from '@/lib/store'
import { ReviewProvider } from '@/lib/review/types'
import { useState, useEffect } from 'react'

interface MessageProps {
    message: {
        id: string
        role: string
        content: string
        images?: string[] | null
        provider?: string | null
        costUsd?: string | null
        agentName?: string
        agentIcon?: string
        agentRole?: string
    }
    previousUserMessage?: string
}

export function Message({ message, previousUserMessage }: MessageProps) {
    const isUser = message.role === 'user'
    const { config, reviews, requestReview, clearReview, isReviewPending } = useReviewStore()
    const { settings } = useChorumStore()
    const [hasAutoReviewed, setHasAutoReviewed] = useState(false)

    const review = reviews[message.id] || null
    const isPending = isReviewPending(message.id)
    const [copied, setCopied] = useState(false)

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(message.content)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error('Failed to copy:', err)
        }
    }

    // ... (rest of useEffects)

    const handleRequestReview = () => {
        if (!previousUserMessage || !message.provider) return
        requestReview({
            messageId: message.id,
            originalTask: previousUserMessage, // ...
            response: message.content,
            responseProvider: message.provider as ReviewProvider,
            agentName: message.agentName,
            agentRole: message.agentRole
        })
    }

    return (
        <div className={`flex gap-4 ${isUser ? 'flex-row-reverse' : ''}`}>
            {/* ... avatar ... */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isUser ? 'bg-blue-600' : 'bg-gray-800 border border-gray-700'}`}>
                {isUser ? (
                    <User className="w-5 h-5" />
                ) : message.agentIcon ? (
                    <span className="text-lg">{message.agentIcon}</span>
                ) : (
                    <Bot className="w-5 h-5" />
                )}
            </div>

            <div className={`flex flex-col max-w-[80%] min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
                {/* Agent name label */}
                {!isUser && message.agentName && (
                    <span className="text-xs text-gray-500 mb-1 ml-1">{message.agentName}</span>
                )}

                <div className={`rounded-xl px-4 py-3 overflow-hidden ${isUser
                    ? 'bg-blue-600/10 text-blue-100 border border-blue-600/20'
                    : 'bg-gray-800 text-gray-100 border border-gray-700'
                    }`}>
                    <div className="prose prose-invert prose-sm max-w-none overflow-x-auto [&>pre]:overflow-x-auto [&_code]:break-all [&_code]:whitespace-pre-wrap">
                        <ReactMarkdown
                            components={{
                                // @ts-ignore
                                code({ node, inline, className, children, ...props }) {
                                    const isBlock = !inline && className?.includes('language-')
                                    return (
                                        <code
                                            className={`${className || ''} bg-gray-950/50 rounded ${isBlock ? 'block overflow-x-auto p-3' : 'px-1 py-0.5'}`}
                                            {...props}
                                        >
                                            {children}
                                        </code>
                                    )
                                },
                                // @ts-ignore
                                pre({ children, ...props }) {
                                    return (
                                        <pre className="overflow-x-auto max-w-full" {...props}>
                                            {children}
                                        </pre>
                                    )
                                }
                            }}
                        >
                            {message.content}
                        </ReactMarkdown>
                    </div>

                    {/* Render Images */}
                    {message.images && message.images.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                            {/* ... image map ... */}
                            {message.images.map((img, idx) => (
                                <div key={idx} className="relative group max-w-sm rounded-lg overflow-hidden border border-gray-700/50">
                                    <img src={img} alt="attached content" className="max-h-64 object-contain cursor-zoom-in hover:brightness-110 transition-all shadow-lg" onClick={() => window.open(img, '_blank')} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {!isUser && (
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                        {message.provider && (
                            <span className="capitalize">{message.provider}</span>
                        )}
                        {settings.showCost && message.costUsd && (
                            <span className="flex items-center gap-0.5 text-green-500/80">
                                <DollarSign className="w-3 h-3" />
                                {Number(message.costUsd).toFixed(6)}
                            </span>
                        )}
                        <button
                            onClick={handleCopy}
                            className="p-1 hover:bg-gray-800 rounded transition-colors hover:text-gray-300"
                            title="Copy message"
                        >
                            {copied ? (
                                <Check className="w-3.5 h-3.5 text-green-500" />
                            ) : (
                                <Copy className="w-3.5 h-3.5" />
                            )}
                        </button>
                    </div>
                )}
                {/* ... peer review ... */}


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
