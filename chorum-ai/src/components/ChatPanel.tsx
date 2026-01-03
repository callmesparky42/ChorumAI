'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Settings } from 'lucide-react'
import { Message } from './Message'
import { ProviderSelector } from './ProviderSelector'
import { CostMeter } from './CostMeter'
import { useChorumStore } from '@/lib/store'
import Link from 'next/link'

export function ChatPanel({ projectId }: { projectId?: string }) {
    const [message, setMessage] = useState('')
    const [selectedProvider, setSelectedProvider] = useState<string>('auto')
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const { messages, sendMessage, isLoading } = useChorumStore()

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
            providerOverride: selectedProvider === 'auto' ? undefined : selectedProvider
        })

        setMessage('')
    }

    return (
        <div className="flex-1 flex flex-col bg-gray-950">
            {/* Header */}
            <div className="h-16 border-b border-gray-800 flex items-center justify-between px-6 bg-gray-950/50 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <img src="/logo.png" alt="Chorum AI" className="h-8 w-auto object-contain" />
                </div>
                <div className="flex items-center gap-4">
                    <CostMeter cost={sessionCost} />
                    <Link href="/settings" className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 transition-colors">
                        <Settings className="w-5 h-5" />
                    </Link>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
                {messages.map((msg) => (
                    <Message key={msg.id} message={msg} />
                ))}
                {messages.length === 0 && (
                    <div className="text-center text-gray-500 mt-20">
                        <p>Start a conversation with Chorum Router.</p>
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
                            placeholder="Ask anything..."
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
                            disabled={!message.trim() || isLoading}
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
