'use client'
import { DollarSign } from 'lucide-react'

interface Props {
    cost: number
}

export function CostMeter({ cost }: { cost: number }) {
    // Color code cost: < $0.01 Green, < $0.10 Yellow, > $0.10 Red
    const color = cost < 0.01 ? 'text-green-400' : cost < 0.10 ? 'text-yellow-400' : 'text-red-400'

    return (
        <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-full px-3 py-1.5">
            <DollarSign className={`w-3 h-3 ${color}`} />
            <span className={`text-xs font-mono font-medium ${color}`}>
                {cost.toFixed(4)}
            </span>
        </div>
    )
}
