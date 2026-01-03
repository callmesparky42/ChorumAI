'use client'
import { useState, useEffect } from 'react'

interface Props {
    value: string
    onChange: (val: string) => void
}

interface Provider {
    id: string
    provider: string
    model: string
}

export function ProviderSelector({ value, onChange }: Props) {
    const [providers, setProviders] = useState<Provider[]>([])

    useEffect(() => {
        fetch('/api/providers').then(res => {
            if (res.ok) return res.json()
            return []
        }).then(data => {
            // Filter out any errors or empty responses
            if (Array.isArray(data)) {
                setProviders(data)
            }
        })
    }, [])

    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg block w-full p-2.5 focus:ring-blue-500 focus:border-blue-500"
        >
            <option value="auto">Auto (Smart Router)</option>
            {providers.map(p => (
                <option key={p.id} value={p.provider}>
                    {p.provider.charAt(0).toUpperCase() + p.provider.slice(1)} ({p.model})
                </option>
            ))}
        </select>
    )
}
