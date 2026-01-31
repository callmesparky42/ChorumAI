'use client'

import { useEffect, useState } from 'react'

/**
 * ChoralSpinner - A nostalgic "spinning wheel of death" but with musical notes
 * Inspired by the classic Mac OS X beach ball, but on-brand for ChorumAI
 */
export function ChoralSpinner({ size = 48 }: { size?: number }) {
    const [rotation, setRotation] = useState(0)

    // Musical notes arranged in a circle
    const notes = ['♩', '♪', '♫', '♬', '𝄞', '♭', '♯', '♮']

    useEffect(() => {
        const interval = setInterval(() => {
            setRotation(prev => (prev + 45) % 360)
        }, 150) // Slightly jerky like the original beachball

        return () => clearInterval(interval)
    }, [])

    const radius = size * 0.35

    return (
        <div
            className="relative"
            style={{
                width: size,
                height: size,
            }}
        >
            {/* Rotating container */}
            <div
                className="absolute inset-0 transition-transform"
                style={{
                    transform: `rotate(${rotation}deg)`,
                    transitionDuration: '100ms',
                    transitionTimingFunction: 'steps(1)',
                }}
            >
                {notes.map((note, i) => {
                    const angle = (i / notes.length) * 360
                    const x = Math.cos((angle - 90) * (Math.PI / 180)) * radius + size / 2
                    const y = Math.sin((angle - 90) * (Math.PI / 180)) * radius + size / 2

                    // Rainbow-ish colors for the kitsch factor
                    const colors = [
                        '#ef4444', // red
                        '#f97316', // orange
                        '#eab308', // yellow
                        '#22c55e', // green
                        '#06b6d4', // cyan
                        '#3b82f6', // blue
                        '#8b5cf6', // violet
                        '#ec4899', // pink
                    ]

                    return (
                        <span
                            key={i}
                            className="absolute font-serif select-none"
                            style={{
                                left: x,
                                top: y,
                                transform: 'translate(-50%, -50%)',
                                fontSize: size * 0.22,
                                color: colors[i],
                                textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                                // Counter-rotate so notes stay upright
                            }}
                        >
                            {note}
                        </span>
                    )
                })}
            </div>
        </div>
    )
}

/**
 * ChoralThinking - Full thinking indicator with spinner and optional text
 */
export function ChoralThinking({ showText = true }: { showText?: boolean }) {
    const [dots, setDots] = useState('')

    useEffect(() => {
        if (!showText) return
        const interval = setInterval(() => {
            setDots(prev => prev.length >= 3 ? '' : prev + '.')
        }, 500)
        return () => clearInterval(interval)
    }, [showText])

    return (
        <div className="flex items-center gap-4 p-4 bg-gray-900/50 rounded-xl border border-gray-800/50 max-w-md">
            <ChoralSpinner size={48} />
            {showText && (
                <div className="flex flex-col">
                    <span className="text-gray-300 text-sm font-medium">
                        the choir is singing{dots}
                    </span>
                    <span className="text-gray-500 text-xs">
                        harmonizing your response
                    </span>
                </div>
            )}
        </div>
    )
}
