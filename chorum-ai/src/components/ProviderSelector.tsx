'use client'
import { useState, useEffect } from 'react'
import { ChevronDown, Cpu } from 'lucide-react'
import clsx from 'clsx'

interface Props {
    value: string
    onChange: (val: string) => void
    mode?: 'default' | 'omnibar'
}

interface Provider {
    id: string
    provider: string
    model: string
}



export function ProviderSelector({ value, onChange, mode = 'default' }: Props) {
    const [providers, setProviders] = useState<Provider[]>([])
    const [isOpen, setIsOpen] = useState(false)

    useEffect(() => {
        fetch('/api/providers').then(res => {
            if (res.ok) return res.json()
            return []
        }).then(data => {
            if (Array.isArray(data)) {
                setProviders(data)
            }
        })
    }, [])

    // Close on click outside
    useEffect(() => {
        if (!isOpen) return;
        const close = () => setIsOpen(false);
        window.addEventListener('click', close);
        return () => window.removeEventListener('click', close);
    }, [isOpen]);

    const selected = providers.find(p => p.provider === value)

    // Derived display label
    const label = value === 'auto'
        ? 'Auto (Smart)'
        : selected
            ? `${selected.provider} (${selected.model})`
            : value

    return (
        <div className="relative" onClick={e => e.stopPropagation()}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={clsx(
                    "flex items-center gap-2 rounded-lg transition-colors border",
                    mode === 'default'
                        ? "bg-gray-800 border-gray-700 text-gray-300 text-xs w-full p-2.5 hover:bg-gray-750 focus:ring-blue-500"
                        : "bg-transparent border-transparent hover:bg-gray-800 text-gray-400 hover:text-gray-200 text-xs px-2 py-1.5"
                )}
                title="Select Model Provider"
            >
                <Cpu className="w-3.5 h-3.5" />
                {mode === 'default' && <span>{label}</span>}
                {mode === 'omnibar' && (
                    <span className="max-w-[100px] truncate">{value === 'auto' ? 'Auto' : value}</span>
                )}
                <ChevronDown className="w-3 h-3 opacity-50 ml-auto" />
            </button>

            {isOpen && (
                <div className="absolute bottom-full mb-1 right-0 min-w-[200px] bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden py-1">
                    <button
                        onClick={() => { onChange('auto'); setIsOpen(false) }}
                        className={clsx(
                            "w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-gray-800 transition-colors",
                            value === 'auto' ? "text-blue-400 bg-blue-500/10" : "text-gray-300"
                        )}
                    >
                        <Cpu className="w-3.5 h-3.5" />
                        <div>
                            <div className="font-medium">Auto (Smart Router)</div>
                            <div className="text-[10px] text-gray-500">Best model for the task</div>
                        </div>
                    </button>

                    <div className="border-t border-gray-800 my-1" />

                    {providers.map(p => (
                        <button
                            key={p.id}
                            onClick={() => { onChange(p.provider); setIsOpen(false) }}
                            className={clsx(
                                "w-full text-left px-3 py-2 text-xs hover:bg-gray-800 transition-colors",
                                value === p.provider ? "text-blue-400 bg-blue-500/10" : "text-gray-300"
                            )}
                        >
                            <div className="font-medium capitalize">{p.provider}</div>
                            <div className="text-[10px] text-gray-500">{p.model}</div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
