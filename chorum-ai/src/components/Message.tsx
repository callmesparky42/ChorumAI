'use client'
import ReactMarkdown from 'react-markdown'
import { Bot, User, DollarSign } from 'lucide-react'

interface MessageProps {
    message: {
        id: string
        role: string
        content: string
        provider?: string | null // string | null in DB, but store might use undefined
        costUsd?: string | null
    }
}

export function Message({ message }: MessageProps) {
    const isUser = message.role === 'user'

    return (
        <div className={`flex gap-4 ${isUser ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isUser ? 'bg-blue-600' : 'bg-purple-600'
                }`}>
                {isUser ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
            </div>

            <div className={`flex flex-col max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
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
            </div>
        </div>
    )
}
