'use client'
import { useState, useEffect } from 'react'

export function HyggeToast({ message, duration = 2000 }: { message: string; duration?: number }) {
    const [visible, setVisible] = useState(true)
    useEffect(() => {
        const t = setTimeout(() => setVisible(false), duration)
        return () => clearTimeout(t)
    }, [duration, message])

    if (!visible) return null
    return (
        <div className="fixed bottom-4 right-4 z-50 bg-[var(--hg-surface)] border border-[var(--hg-border)] px-4 py-2 text-sm text-[var(--hg-text-secondary)] animate-fade-in shadow-lg">
            {message}
        </div>
    )
}
