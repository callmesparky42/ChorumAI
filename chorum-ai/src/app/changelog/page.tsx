import { parseChangelog } from '@/lib/changelog/parser';
import { Calendar, Package, Plus, Wrench, Trash2, AlertTriangle, Shield, ArrowLeft } from 'lucide-react';
import { ChangelogEntry, ChangelogSection } from '@/lib/changelog/parser';
import Link from 'next/link';

const categoryIcons = {
    Added: Plus,
    Changed: Package,
    Fixed: Wrench,
    Removed: Trash2,
    Deprecated: AlertTriangle,
    Security: Shield,
};

const categoryColors = {
    Added: 'text-green-400 bg-green-400/10 border-green-400/20',
    Changed: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    Fixed: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
    Removed: 'text-red-400 bg-red-400/10 border-red-400/20',
    Deprecated: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    Security: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
};

function CategoryBadge({ type }: { type: ChangelogSection['type'] }) {
    const Icon = categoryIcons[type];
    const colorClass = categoryColors[type];

    return (
        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium ${colorClass}`}>
            <Icon className="w-3.5 h-3.5" />
            {type}
        </div>
    );
}

function ReleaseCard({ entry, isLatest }: { entry: ChangelogEntry; isLatest: boolean }) {
    return (
        <div
            id={`v${entry.version}`}
            className="bg-gray-900 border border-gray-800 rounded-xl p-8 hover:border-gray-700 transition-all duration-300 scroll-mt-24"
        >
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-2xl font-bold text-white">
                            v{entry.version}
                        </h2>
                        {isLatest && (
                            <div className="px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full">
                                <span className="text-xs font-medium text-blue-400">Latest</span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Calendar className="w-4 h-4" />
                        <time dateTime={entry.date}>{entry.date}</time>
                    </div>
                </div>
            </div>

            {/* Sections */}
            <div className="space-y-6">
                {entry.sections.map((section, idx) => (
                    <div key={idx}>
                        <div className="mb-3">
                            <CategoryBadge type={section.type} />
                        </div>
                        <ul className="space-y-3">
                            {section.items.map((item, itemIdx) => (
                                <li key={itemIdx} className="text-gray-300 leading-relaxed">
                                    <div
                                        className="prose prose-invert prose-sm max-w-none"
                                        dangerouslySetInnerHTML={{ __html: formatMarkdown(item) }}
                                    />
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Simple markdown formatter for inline formatting
function formatMarkdown(text: string): string {
    return text
        // Remove file path references like (src/lib/...) or (`src/lib/...`)
        .replace(/\s*\(`?src\/[^)]+`?\)\.?/g, '.')
        .replace(/\s*\(`?[a-zA-Z]+\/[a-zA-Z/]+\.[a-z]+`?(?:,\s*`?[a-zA-Z]+\/[a-zA-Z/]+\.[a-z]+`?)*\)\.?/g, '.')
        // Clean up double periods
        .replace(/\.\.+/g, '.')
        // Bold: **text** -> <strong>text</strong>
        .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
        // Code: `text` -> <code>text</code>
        .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-gray-800 rounded text-blue-400 text-sm font-mono">$1</code>')
        // Links: [text](url) -> <a>text</a>
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">$1</a>');
}

export default function ChangelogPage() {
    const entries = parseChangelog();

    return (
        <div className="min-h-screen bg-black">
            {/* Back Button */}
            <div className="absolute top-6 left-6">
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to App
                </Link>
            </div>

            {/* Hero Section */}
            <div className="border-b border-gray-800 bg-gradient-to-b from-gray-900/50 to-black">
                <div className="max-w-4xl mx-auto px-6 py-16 pt-20">
                    <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                        What's New
                    </h1>
                    <p className="text-lg text-gray-400 max-w-2xl">
                        The latest features, improvements, and fixes to ChorumAI. Stay up to date with our product evolution.
                    </p>
                </div>
            </div>

            {/* Changelog Entries */}
            <div className="max-w-4xl mx-auto px-6 py-12">
                <div className="space-y-8">
                    {entries.map((entry, idx) => (
                        <ReleaseCard key={entry.version} entry={entry} isLatest={idx === 0} />
                    ))}
                </div>

                {entries.length === 0 && (
                    <div className="text-center py-12">
                        <p className="text-gray-500">No changelog entries found.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
