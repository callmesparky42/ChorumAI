/**
 * IMPORT-KNOWLEDGE COMMAND
 * 
 * Import knowledge from JSON/YAML files.
 * Bulk load patterns, decisions, invariants.
 */

import * as fs from 'fs/promises';
import * as yaml from 'yaml';
import { H4x0rRenderer } from '../renderer/h4x0r';
import { getConfig } from '../config';
import { chorumApi } from '../api/client';

interface ImportKnowledgeOptions {
  project?: string;
  type?: string;
  dryRun?: boolean;
}

interface KnowledgeItem {
  content: string;
  context?: string;
  domains?: string[];
  type?: string;
}

interface KnowledgeFile {
  patterns?: KnowledgeItem[];
  decisions?: KnowledgeItem[];
  invariants?: KnowledgeItem[];
  facts?: KnowledgeItem[];
}

export async function importKnowledgeCommand(
  file: string,
  options: ImportKnowledgeOptions,
  renderer: H4x0rRenderer
): Promise<void> {
  const config = await getConfig();

  if (!config.apiToken) {
    renderer.error('Not authenticated. Run `chorum login` first.');
    return;
  }

  // Check file exists
  try {
    await fs.access(file);
  } catch {
    renderer.error(`File not found: ${file}`);
    return;
  }

  try {
    await renderer.typeText('Parsing knowledge file...', 15);

    const content = await fs.readFile(file, 'utf-8');

    // Parse based on extension
    let knowledge: KnowledgeFile;
    if (file.endsWith('.yaml') || file.endsWith('.yml')) {
      knowledge = yaml.parse(content);
    } else if (file.endsWith('.json')) {
      knowledge = JSON.parse(content);
    } else {
      renderer.error('Unsupported file format. Use .json or .yaml');
      return;
    }

    // Collect all items
    const items: Array<{ type: string; item: KnowledgeItem }> = [];

    if (knowledge.patterns) {
      for (const item of knowledge.patterns) {
        items.push({ type: options.type || 'pattern', item });
      }
    }
    if (knowledge.decisions) {
      for (const item of knowledge.decisions) {
        items.push({ type: options.type || 'decision', item });
      }
    }
    if (knowledge.invariants) {
      for (const item of knowledge.invariants) {
        items.push({ type: options.type || 'invariant', item });
      }
    }
    if (knowledge.facts) {
      for (const item of knowledge.facts) {
        items.push({ type: options.type || 'fact', item });
      }
    }

    if (items.length === 0) {
      renderer.error('No knowledge items found in file');
      renderer.dim('Expected format: { patterns: [...], decisions: [...], etc. }');
      return;
    }

    renderer.info(`Found ${items.length} knowledge items`);
    console.log('');

    // Show preview
    renderer.table(
      ['TYPE', 'CONTENT', 'DOMAINS'],
      items.slice(0, 10).map(({ type, item }) => [
        type.toUpperCase(),
        truncate(item.content, 40),
        item.domains?.join(', ') || '-',
      ])
    );

    if (items.length > 10) {
      renderer.dim(`... and ${items.length - 10} more`);
    }

    console.log('');

    // Dry run stops here
    if (options.dryRun) {
      renderer.info('Dry run complete. No items imported.');
      return;
    }

    // Confirm
    const confirmed = await renderer.confirm(`Import ${items.length} items?`);
    if (!confirmed) {
      renderer.info('Import cancelled.');
      return;
    }

    // Import items
    let imported = 0;
    let failed = 0;

    for (const { type, item } of items) {
      try {
        await chorumApi.addMemory({
          content: item.content,
          type,
          projectId: options.project,
          domains: item.domains,
        });
        imported++;

        // Progress indicator
        const progress = Math.floor((imported + failed) / items.length * 30);
        const bar = '█'.repeat(progress) + '░'.repeat(30 - progress);
        process.stdout.write(`\r\x1b[38;2;0;255;0m[${bar}] ${imported + failed}/${items.length}`);

      } catch (err: any) {
        failed++;
      }
    }

    console.log('');
    console.log('');

    renderer.success(`Import complete!`);
    renderer.print(`  Imported: ${imported}`);
    if (failed > 0) {
      renderer.warn(`  Failed: ${failed}`);
    }

  } catch (err: any) {
    if (err.name === 'SyntaxError') {
      renderer.error(`Invalid file format: ${err.message}`);
    } else {
      renderer.error(`Import failed: ${err.message}`);
    }
  }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
