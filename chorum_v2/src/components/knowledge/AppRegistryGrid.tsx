'use client'

import { AppRegistryCard } from './AppRegistryCard'
import type { AppRegistryEntry } from '@/lib/shell/knowledge-actions'

export function AppRegistryGrid({
    apps,
    selectedApp,
    onSelectApp,
}: {
    apps: AppRegistryEntry[]
    selectedApp: string | null
    onSelectApp: (slug: string | null) => void
}) {
    return (
        <section className="h-full flex flex-col">
            <h2 className="text-xs font-mono uppercase tracking-wider text-[var(--hg-text-tertiary)] mb-3">
                Connected Apps
            </h2>
            <div
                className="flex gap-4 overflow-x-auto pb-2 flex-1"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                <style dangerouslySetInnerHTML={{
                    __html: `
                    div::-webkit-scrollbar { display: none; }
                `}} />
                {apps.map(app => (
                    <AppRegistryCard
                        key={app.slug}
                        app={app}
                        isSelected={selectedApp === app.slug}
                        onClick={() => onSelectApp(selectedApp === app.slug ? null : app.slug)}
                    />
                ))}
            </div>
        </section>
    )
}
