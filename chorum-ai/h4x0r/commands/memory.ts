/**
 * MEMORY COMMAND
 * 
 * Manage sovereign memory from the terminal.
 * List, add, delete, search.
 */

import { H4x0rRenderer } from '../renderer/h4x0r';
import { getConfig } from '../config';
import { chorumApi } from '../api/client';

interface MemoryOptions {
  project?: string;
  type?: string;
  limit?: string;
  content?: string;
  domains?: string;
  id?: string;
  query?: string;
  force?: boolean;
}

export async function memoryCommand(
  action: 'list' | 'add' | 'delete' | 'search',
  options: MemoryOptions,
  renderer: H4x0rRenderer
): Promise<void> {
  const config = await getConfig();

  if (!config.apiToken) {
    renderer.error('Not authenticated. Run `chorum login` first.');
    return;
  }

  try {
    switch (action) {
      case 'list':
        await listMemory(options, renderer);
        break;
      case 'add':
        await addMemory(options, renderer);
        break;
      case 'delete':
        await deleteMemory(options, renderer);
        break;
      case 'search':
        await searchMemory(options, renderer);
        break;
      default:
        renderer.error(`Unknown memory action: ${action}`);
    }
  } catch (err: any) {
    renderer.error(`Memory operation failed: ${err.message}`);
  }
}

async function listMemory(options: MemoryOptions, renderer: H4x0rRenderer): Promise<void> {
  renderer.dim('Fetching memory items...');

  const items = await chorumApi.listMemory({
    projectId: options.project,
    type: options.type,
    limit: options.limit ? parseInt(options.limit) : 20,
  });

  if (items.length === 0) {
    renderer.info('No memory items found.');
    return;
  }

  console.log('');
  renderer.table(
    ['ID', 'TYPE', 'CONTENT', 'UPDATED'],
    items.map(item => [
      item.id.slice(0, 8),
      item.type.toUpperCase(),
      truncate(item.content, 40),
      formatDate(item.updatedAt),
    ])
  );
  console.log('');
  renderer.dim(`Total: ${items.length} items`);
}

async function addMemory(options: MemoryOptions, renderer: H4x0rRenderer): Promise<void> {
  if (!options.content) {
    renderer.error('No content provided');
    return;
  }

  renderer.dim('Adding memory item...');

  const domains = options.domains?.split(',').map(d => d.trim()) || [];

  const item = await chorumApi.addMemory({
    content: options.content,
    type: options.type || 'pattern',
    projectId: options.project,
    domains,
  });

  renderer.success(`Memory item added: ${item.id.slice(0, 8)}`);
  renderer.dim(`Type: ${item.type} | Domains: ${item.domains?.join(', ') || 'none'}`);
}

async function deleteMemory(options: MemoryOptions, renderer: H4x0rRenderer): Promise<void> {
  if (!options.id) {
    renderer.error('No ID provided');
    return;
  }

  if (!options.force) {
    const confirmed = await renderer.confirm(`Delete memory item ${options.id}?`);
    if (!confirmed) {
      renderer.info('Cancelled.');
      return;
    }
  }

  renderer.dim('Deleting memory item...');

  await chorumApi.deleteMemory(options.id);

  renderer.success(`Memory item deleted: ${options.id}`);
}

async function searchMemory(options: MemoryOptions, renderer: H4x0rRenderer): Promise<void> {
  if (!options.query) {
    renderer.error('No search query provided');
    return;
  }

  renderer.dim(`Searching: "${options.query}"...`);

  const items = await chorumApi.searchMemory(options.query, {
    projectId: options.project,
    limit: options.limit ? parseInt(options.limit) : 10,
  });

  if (items.length === 0) {
    renderer.info('No matching memory items found.');
    return;
  }

  console.log('');
  
  for (const item of items) {
    console.log('');
    renderer.print(`┌─ ${item.type.toUpperCase()} [${item.id.slice(0, 8)}]`);
    renderer.print(`│`);
    
    // Word wrap content
    const lines = wordWrap(item.content, 60);
    for (const line of lines) {
      renderer.print(`│  ${line}`);
    }
    
    renderer.dim(`│`);
    renderer.dim(`└─ Updated: ${formatDate(item.updatedAt)} | Domains: ${item.domains?.join(', ') || 'none'}`);
  }
  
  console.log('');
  renderer.dim(`Found: ${items.length} items`);
}

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  
  return date.toLocaleDateString();
}

function wordWrap(str: string, maxLen: number): string[] {
  const words = str.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= maxLen) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  
  if (currentLine) lines.push(currentLine);
  return lines;
}
