'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, Users, Plus, X, Image as ImageIcon, PanelRight, PanelRightClose, Zap, Paperclip } from 'lucide-react'
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

    const { messages, sendMessage, isLoading, isAgentPanelOpen, toggleAgentPanel } = useChorumStore()
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
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => updateReviewConfig({ enabled: !reviewConfig.enabled })}
                        className={clsx(
                            'hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors',
                            reviewConfig.enabled
                                ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                                : 'bg-gray-800/50 text-gray-500 hover:text-gray-400 border border-gray-700'
                        )}
                        title="Phone a Friend - Get second opinion from another LLM"
                    >
                        <Users className="w-4 h-4" />
                        <span className="hidden lg:inline">Review</span>
                    </button>

                    <button
                        onClick={toggleAgentPanel}
                        className={clsx(
                            "p-2 rounded-lg transition-colors border",
                            isAgentPanelOpen
                                ? "bg-blue-600/10 text-blue-400 border-blue-500/30"
                                : "text-gray-500 hover:text-gray-400 border-transparent hover:bg-gray-800"
                        )}
                        title={isAgentPanelOpen ? "Close Agent Drawer" : "Open Agent Drawer"}
                    >
                        {isAgentPanelOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRight className="w-5 h-5" />}
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
            <div className="border-t border-gray-800 p-6 bg-gray-950">
                <div className="max-w-4xl mx-auto">
                    <div
                        className={clsx(
                            "relative flex flex-col bg-gray-900 border border-gray-800 rounded-xl transition-all shadow-sm",
                            "focus-within:border-gray-700 focus-within:ring-1 focus-within:ring-gray-800",
                            isDragging && "ring-2 ring-blue-500/50 border-blue-500 bg-blue-500/5"
                        )}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                    >
                        {/* Omnibar Header: Agent & Context */}
                        <div className="flex items-center gap-2 p-1.5 border-b border-gray-800/50">
                            <AgentSelector
                                value={selectedAgent}
                                onChange={setSelectedAgent}
                                mode="omnibar"
                            />

                            {/* Context Indicator (Placeholder logic) */}
                            {(activeAgent || selectedAgent !== 'auto') && (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-medium border border-blue-500/20">
                                    <Zap className="w-3 h-3" />
                                    <span>Context Active</span>
                                </div>
                            )}
                        </div>

                        {/* Input Area */}
                        <div className="p-3">
                            {/* Image Previews */}
                            {images.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {images.map((img, idx) => (
                                        <div key={idx} className="relative group/img w-16 h-16 rounded-lg overflow-hidden border border-gray-700 shadow-sm">
                                            <img src={img} alt="preview" className="w-full h-full object-cover" />
                                            <button
                                                onClick={() => removeImage(idx)}
                                                className="absolute top-0.5 right-0.5 p-0.5 bg-black/50 text-white rounded-full opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-red-500"
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
                                className="w-full bg-transparent border-none text-gray-200 placeholder-gray-500 focus:ring-0 resize-none p-0 text-base min-h-[60px]"
                                rows={1}
                                style={{ minHeight: '60px' }}
                            />
                        </div>

                        {/* Omnibar Footer: Actions & Send */}
                        <div className="flex items-center justify-between p-2 pt-0">
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-2 hover:bg-gray-800 rounded-lg text-gray-500 hover:text-gray-300 transition-colors"
                                    title="Attach image"
                                >
                                    <Paperclip className="w-4 h-4" />
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

                            <div className="flex items-center gap-2">
                                <ProviderSelector
                                    value={selectedProvider}
                                    onChange={setSelectedProvider}
                                    mode="omnibar"
                                />
                                <div className="h-4 w-px bg-gray-800 mx-1" />
                                <button
                                    onClick={handleSend}
                                    disabled={!message.trim() || isLoading}
                                    className="p-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 rounded-lg transition-colors flex items-center justify-center text-white shadow-sm"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="text-center mt-3">
                        <div className="text-[10px] text-gray-600">
                            <strong>Enter</strong> to send, <strong>Shift + Enter</strong> for new line
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
