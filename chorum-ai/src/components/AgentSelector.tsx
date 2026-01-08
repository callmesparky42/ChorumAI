'use client'
import { useState, useEffect } from 'react'
import { Bot } from 'lucide-react'
import clsx from 'clsx'

interface Props {
    value: string
    onChange: (val: string) => void
}

interface AgentInfo {
    id: string
    name: string
    icon: string
    tier: 'reasoning' | 'balanced' | 'fast'
    role: string
}

export function AgentSelector({ value, onChange }: Props) {
    const [agents, setAgents] = useState<AgentInfo[]>([])
    const [isOpen, setIsOpen] = useState(false)

    useEffect(() => {
        // Fetch available agents from API
        fetch('/api/agents/list').then(res => {
            if (res.ok) return res.json()
            return { agents: [] }
        }).then(data => {
            if (Array.isArray(data.agents)) {
                setAgents(data.agents)
            }
        }).catch(() => {
            // Fallback - agent list will be empty
        })
    }, [])

    const selectedAgent = agents.find(a => a.id === value)

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg w-full p-2.5 focus:ring-blue-500 focus:border-blue-500 hover:bg-gray-750"
            >
                {value === 'auto' ? (
                    <>
                        <Bot className="w-4 h-4 text-gray-500" />
                        <span>Auto Agent</span>
                    </>
                ) : selectedAgent ? (
                    <>
                        <span className="text-base">{selectedAgent.icon}</span>
                        <span>{selectedAgent.name}</span>
                        <span className={clsx(
                            'text-[10px] px-1.5 py-0.5 rounded ml-auto',
                            selectedAgent.tier === 'reasoning' && 'bg-purple-500/20 text-purple-400',
                            selectedAgent.tier === 'balanced' && 'bg-blue-500/20 text-blue-400',
                            selectedAgent.tier === 'fast' && 'bg-green-500/20 text-green-400'
                        )}>
                            {selectedAgent.tier}
                        </span>
                    </>
                ) : (
                    <>
                        <Bot className="w-4 h-4 text-gray-500" />
                        <span>{value}</span>
                    </>
                )}
            </button>

            {isOpen && (
                <div className="absolute bottom-full mb-1 left-0 right-0 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                    {/* Auto option */}
                    <button
                        className={clsx(
                            'w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-700',
                            value === 'auto' && 'bg-gray-700'
                        )}
                        onClick={() => { onChange('auto'); setIsOpen(false) }}
                    >
                        <Bot className="w-4 h-4 text-gray-500" />
                        <div>
                            <div className="text-gray-200">Auto Agent</div>
                            <div className="text-xs text-gray-500">Let AI pick the best agent for your message</div>
                        </div>
                    </button>

                    {/* Separator */}
                    <div className="border-t border-gray-700 my-1" />

                    {/* Agent options */}
                    {agents.map(agent => (
                        <button
                            key={agent.id}
                            className={clsx(
                                'w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-700',
                                value === agent.id && 'bg-gray-700'
                            )}
                            onClick={() => { onChange(agent.id); setIsOpen(false) }}
                        >
                            <span className="text-lg">{agent.icon}</span>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm text-gray-200">{agent.name}</div>
                                <div className="text-xs text-gray-500 truncate">{agent.role}</div>
                            </div>
                            <span className={clsx(
                                'text-[10px] px-1.5 py-0.5 rounded shrink-0',
                                agent.tier === 'reasoning' && 'bg-purple-500/20 text-purple-400',
                                agent.tier === 'balanced' && 'bg-blue-500/20 text-blue-400',
                                agent.tier === 'fast' && 'bg-green-500/20 text-green-400'
                            )}>
                                {agent.tier}
                            </span>
                        </button>
                    ))}

                    {agents.length === 0 && (
                        <div className="px-3 py-2 text-sm text-gray-500">
                            Loading agents...
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
