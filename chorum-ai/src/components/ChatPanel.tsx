'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, Users } from 'lucide-react'
import { Message } from './Message'
import { ProviderSelector } from './ProviderSelector'
import { CostMeter } from './CostMeter'
import { useChorumStore } from '@/lib/store'
import { useAgentStore } from '@/lib/agents/store'
import { useReviewStore } from '@/lib/review/store'
import clsx from 'clsx'

export function ChatPanel({ projectId }: { projectId?: string }) {
    const [message, setMessage] = useState('')
    const [selectedProvider, setSelectedProvider] = useState<string>('auto')
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const { messages, sendMessage, isLoading } = useChorumStore()
    const { activeAgent } = useAgentStore()
    const { config: reviewConfig, updateConfig: updateReviewConfig } = useReviewStore()

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    // Calculate total session cost
    const sessionCost = messages.reduce((acc, msg) => acc + (Number(msg.costUsd) || 0), 0)

    const handleSend = async () => {
        if (!message.trim() || !projectId) return

        await sendMessage({
            projectId,
            content: message,
            providerOverride: selectedProvider === 'auto' ? undefined : selectedProvider,
            agent: activeAgent
        })

        setMessage('')
    }

    return (
        <div className="flex-1 flex flex-col bg-gray-950">
            {/* Header */}
            <div className="h-14 border-b border-gray-800 flex items-center justify-between px-6 bg-gray-950/50 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    {activeAgent && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-full border border-gray-700">
                            <span className="text-base">{activeAgent.icon}</span>
                            <span className="text-sm text-gray-300">{activeAgent.name}</span>
                            <span className={clsx(
                                'text-xs px-1.5 py-0.5 rounded',
                                activeAgent.tier === 'reasoning' && 'bg-purple-500/20 text-purple-400',
                                activeAgent.tier === 'balanced' && 'bg-blue-500/20 text-blue-400',
                                activeAgent.tier === 'fast' && 'bg-green-500/20 text-green-400'
                            )}>
                                {activeAgent.tier}
                            </span>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-4">
                    <CostMeter cost={sessionCost} />
                    <button
                        onClick={() => updateReviewConfig({ enabled: !reviewConfig.enabled })}
                        className={clsx(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors',
                            reviewConfig.enabled
                                ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                                : 'bg-gray-800/50 text-gray-500 hover:text-gray-400 border border-gray-700'
                        )}
                        title="Phone a Friend - Get second opinion from another LLM"
                    >
                        <Users className="w-4 h-4" />
                        <span className="hidden sm:inline">Review</span>
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
                {messages.map((msg, index) => {
                    // Find the most recent user message before this one
                    const previousUserMessage = messages
                        .slice(0, index)
                        .reverse()
                        .find(m => m.role === 'user')?.content
                    return (
                        <Message
                            key={msg.id}
                            message={msg}
                            previousUserMessage={previousUserMessage}
                        />
                    )
                })}
                {messages.length === 0 && (
                    <div className="text-center text-gray-500 mt-20">
                        {activeAgent ? (
                            <>
                                <p className="text-4xl mb-4">{activeAgent.icon}</p>
                                <p className="font-medium text-gray-400 mb-1">{activeAgent.name} ready</p>
                                <p className="text-sm text-gray-600 max-w-md mx-auto">
                                    {activeAgent.memory.semanticFocus}
                                </p>
                            </>
                        ) : (
                            <>
                                <h1 className="text-2xl font-semibold text-white mb-2">Welcome to ChorumAI</h1>
                                <p className="text-gray-400">Begin a project, begin a chat, or initiate an agent</p>
                            </>
                        )}
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gray-800 p-4">
                <div className="flex items-end gap-3">
                    <div className="flex-1">
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    handleSend()
                                }
                            }}
                            placeholder={activeAgent
                                ? `Ask ${activeAgent.name}...`
                                : "Type a message..."
                            }
                            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 resize-none"
                            rows={3}
                        />
                    </div>

                    <div className="flex flex-col gap-2 w-48">
                        <ProviderSelector
                            value={selectedProvider}
                            onChange={setSelectedProvider}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!message.trim() || isLoading || !activeAgent}
                            className="p-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg transition-colors flex justify-center text-white"
                        >
                            <Send className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
