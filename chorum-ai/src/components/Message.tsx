'use client'
import ReactMarkdown from 'react-markdown'
import { Bot, User, DollarSign } from 'lucide-react'
import { PeerReview } from './PeerReview'
import { useReviewStore } from '@/lib/review/store'
import { ReviewProvider } from '@/lib/review/types'
import { useState, useEffect } from 'react'

interface MessageProps {
    message: {
        id: string
        role: string
        content: string
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
    const [hasAutoReviewed, setHasAutoReviewed] = useState(false)

    const review = reviews[message.id] || null
    const isPending = isReviewPending(message.id)

    // Auto-request review when enabled and this is an assistant message
    useEffect(() => {
        if (
            !isUser &&
            config.enabled &&
            config.mode === 'auto' &&
            !review &&
            !isPending &&
            !hasAutoReviewed &&
            previousUserMessage &&
            message.provider
        ) {
            setHasAutoReviewed(true)
            requestReview({
                messageId: message.id,
                originalTask: previousUserMessage,
                response: message.content,
                responseProvider: message.provider as ReviewProvider,
                agentName: message.agentName,
                agentRole: message.agentRole
            })
        }
    }, [config.enabled, config.mode, message, previousUserMessage, review, isPending, hasAutoReviewed, isUser, requestReview])

    const handleRequestReview = () => {
        if (!previousUserMessage || !message.provider) return
        requestReview({
            messageId: message.id,
            originalTask: previousUserMessage,
            response: message.content,
            responseProvider: message.provider as ReviewProvider,
            agentName: message.agentName,
            agentRole: message.agentRole
        })
    }

    return (
        <div className={`flex gap-4 ${isUser ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isUser ? 'bg-blue-600' : 'bg-gray-800 border border-gray-700'
                }`}>
                {isUser ? (
                    <User className="w-5 h-5" />
                ) : message.agentIcon ? (
                    <span className="text-lg">{message.agentIcon}</span>
                ) : (
                    <Bot className="w-5 h-5" />
                )}
            </div>

            <div className={`flex flex-col max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
                {/* Agent name label */}
                {!isUser && message.agentName && (
                    <span className="text-xs text-gray-500 mb-1 ml-1">{message.agentName}</span>
                )}

                <div className={`rounded-xl px-4 py-3 ${isUser
                    ? 'bg-blue-600/10 text-blue-100 border border-blue-600/20'
                    : 'bg-gray-800 text-gray-100 border border-gray-700'
                    }`}>
                    <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown
                            components={{
                                // @ts-ignore
                                code({ node, inline, className, children, ...props }) {
                                    return (
                                        <code className={`${className} bg-gray-950/50 rounded px-1 py-0.5`} {...props}>
                                            {children}
                                        </code>
                                    )
                                }
                            }}
                        >
                            {message.content}
                        </ReactMarkdown>
                    </div>
                </div>

                {!isUser && (
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                        {message.provider && (
                            <span className="capitalize">{message.provider}</span>
                        )}
                        {message.costUsd && (
                            <span className="flex items-center gap-0.5 text-green-500/80">
                                <DollarSign className="w-3 h-3" />
                                {Number(message.costUsd).toFixed(6)}
                            </span>
                        )}
                    </div>
                )}

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
