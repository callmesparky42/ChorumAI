'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, Users, Plus, X, Image as ImageIcon } from 'lucide-react'
import { Message } from './Message'
import { ProviderSelector } from './ProviderSelector'
import { AgentSelector } from './AgentSelector'
import { CostMeter } from './CostMeter'
import { useChorumStore } from '@/lib/store'
import { useAgentStore } from '@/lib/agents/store'
import { useReviewStore } from '@/lib/review/store'
import clsx from 'clsx'

export function ChatPanel({ projectId }: { projectId?: string }) {
    const [message, setMessage] = useState('')
    const [selectedProvider, setSelectedProvider] = useState<string>('auto')
    const [selectedAgent, setSelectedAgent] = useState<string>('auto')
    const [images, setImages] = useState<string[]>([])
    const [isDragging, setIsDragging] = useState(false)

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const { messages, sendMessage, isLoading } = useChorumStore()
    const { activeAgent } = useAgentStore()
    const { config: reviewConfig, updateConfig: updateReviewConfig } = useReviewStore()

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files) return
        processFiles(files)
    }

    const processFiles = (files: FileList | File[]) => {
        Array.from(files).forEach(file => {
            if (!file.type.startsWith('image/')) return
            // Check file size (limit to 5MB)
            if (file.size > 5 * 1024 * 1024) {
                alert('File too large (max 5MB)')
                return
            }

            const reader = new FileReader()
            reader.onload = (e) => {
                const base64 = e.target?.result as string
                setImages(prev => {
                    if (prev.includes(base64)) return prev
                    return [...prev, base64].slice(-5) // Limit to 5 images
                })
            }
            reader.readAsDataURL(file)
        })
    }

    const removeImage = (index: number) => {
        setImages(prev => prev.filter((_, i) => i !== index))
    }

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const onDragLeave = () => {
        setIsDragging(false)
    }

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        if (e.dataTransfer.files) {
            processFiles(Array.from(e.dataTransfer.files))
        }
    }

    // Calculate total session cost
    const sessionCost = messages.reduce((acc, msg) => acc + (Number(msg.costUsd) || 0), 0)

    const handleSend = async () => {
        if (!message.trim() || !projectId) return

        await sendMessage({
            projectId,
            content: message,
            images: images.length > 0 ? images : undefined,
            providerOverride: selectedProvider === 'auto' ? undefined : selectedProvider,
            agentOverride: selectedAgent
        })

        setMessage('')
        setImages([])
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
                        <div
                            className={clsx(
                                "relative flex-1 group",
                                isDragging && "after:absolute after:inset-0 after:bg-blue-500/10 after:border-2 after:border-blue-500 after:border-dashed after:rounded-lg"
                            )}
                            onDragOver={onDragOver}
                            onDragLeave={onDragLeave}
                            onDrop={onDrop}
                        >
                            {/* Image Previews */}
                            {images.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-2 p-2 bg-gray-900/50 rounded-lg border border-gray-800">
                                    {images.map((img, idx) => (
                                        <div key={idx} className="relative group/img w-20 h-20 rounded-md overflow-hidden border border-gray-700">
                                            <img src={img} alt="preview" className="w-full h-full object-cover" />
                                            <button
                                                onClick={() => removeImage(idx)}
                                                className="absolute top-1 right-1 p-1 bg-red-500 rounded-full opacity-0 group-hover/img:opacity-100 transition-opacity text-white"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

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

                            <div className="absolute left-3 bottom-3 flex gap-2">
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-1.5 hover:bg-gray-700 rounded-md transition-colors text-gray-400 hover:text-white"
                                    title="Add image"
                                >
                                    <Plus className="w-5 h-5" />
                                </button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileSelect}
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 w-48">
                        <AgentSelector
                            value={selectedAgent}
                            onChange={setSelectedAgent}
                        />
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
