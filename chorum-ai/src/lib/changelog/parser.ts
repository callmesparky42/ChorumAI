import fs from 'fs';
import path from 'path';

export interface ChangelogSection {
    type: 'Added' | 'Changed' | 'Fixed' | 'Removed' | 'Deprecated' | 'Security';
    items: string[];
}

export interface ChangelogEntry {
    version: string;
    date: string;
    sections: ChangelogSection[];
    rawContent: string;
}

/**
 * Parse CHANGELOG.md and extract structured release data
 */
export function parseChangelog(): ChangelogEntry[] {
    const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
    const content = fs.readFileSync(changelogPath, 'utf-8');

    const entries: ChangelogEntry[] = [];
    const lines = content.split('\n');

    let currentEntry: ChangelogEntry | null = null;
    let currentSection: ChangelogSection | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Match version header: ## [0.2.2] - 2026-02-07
        const versionMatch = line.match(/^##\s+\[([^\]]+)\]\s+-\s+(.+)$/);
        if (versionMatch) {
            // Save previous entry
            if (currentEntry && currentSection) {
                currentEntry.sections.push(currentSection);
                currentSection = null;
            }
            if (currentEntry) {
                entries.push(currentEntry);
            }

            // Start new entry
            currentEntry = {
                version: versionMatch[1],
                date: versionMatch[2],
                sections: [],
                rawContent: ''
            };
            continue;
        }

        // Match section header: ### Added
        const sectionMatch = line.match(/^###\s+(Added|Changed|Fixed|Removed|Deprecated|Security)$/);
        if (sectionMatch && currentEntry) {
            // Save previous section
            if (currentSection) {
                currentEntry.sections.push(currentSection);
            }

            // Start new section
            currentSection = {
                type: sectionMatch[1] as ChangelogSection['type'],
                items: []
            };
            continue;
        }

        // Match list item: - **Feature**: Description
        const itemMatch = line.match(/^-\s+(.+)$/);
        if (itemMatch && currentSection) {
            currentSection.items.push(itemMatch[1].trim());
            continue;
        }

        // Accumulate raw content for the entry
        if (currentEntry && line.trim()) {
            currentEntry.rawContent += line + '\n';
        }
    }

    // Save last entry and section
    if (currentEntry && currentSection) {
        currentEntry.sections.push(currentSection);
    }
    if (currentEntry) {
        entries.push(currentEntry);
    }

    return entries;
}

/**
 * Get a specific changelog entry by version
 */
export function getChangelogEntry(version: string): ChangelogEntry | null {
    const entries = parseChangelog();
    return entries.find(entry => entry.version === version) || null;
}

/**
 * Get the latest N changelog entries
 */
export function getLatestEntries(count: number = 5): ChangelogEntry[] {
    const entries = parseChangelog();
    return entries.slice(0, count);
}
