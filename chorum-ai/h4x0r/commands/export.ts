/**
 * EXPORT COMMAND
 */

import * as fs from 'fs/promises';
import { H4x0rRenderer } from '../renderer/h4x0r';
import { getConfig } from '../config';
import { chorumApi } from '../api/client';

interface ExportOptions {
  project?: string;
  output?: string;
  plaintext?: boolean;
}

export async function exportCommand(
  options: ExportOptions,
  renderer: H4x0rRenderer
): Promise<void> {
  const config = await getConfig();

  if (!config.apiToken) {
    renderer.error('Not authenticated. Run `chorum login` first.');
    return;
  }

  // Warning for plaintext export
  if (options.plaintext) {
    renderer.warn('╔════════════════════════════════════════════════════════╗');
    renderer.warn('║  ⚠  PLAINTEXT EXPORT WARNING                           ║');
    renderer.warn('╠════════════════════════════════════════════════════════╣');
    renderer.warn('║  This export will NOT be encrypted.                    ║');
    renderer.warn('║  Anyone with the file can read your memory.            ║');
    renderer.warn('║  Do not commit to git or share publicly.               ║');
    renderer.warn('╚════════════════════════════════════════════════════════╝');
    console.log('');

    const confirmed = await renderer.confirm('Continue with plaintext export?');
    if (!confirmed) {
      renderer.info('Export cancelled.');
      return;
    }
  }

  try {
    await renderer.typeText('Preparing export...', 15);

    const data = await renderer.spinner(
      'Exporting memory',
      chorumApi.exportMemory({
        projectId: options.project,
        plaintext: options.plaintext,
      })
    );

    // Generate filename
    const timestamp = new Date().toISOString().split('T')[0];
    const suffix = options.plaintext ? '-PLAINTEXT.zip' : '.chorum';
    const projectSuffix = options.project ? `-${options.project}` : '';
    const defaultFilename = `chorum-export${projectSuffix}-${timestamp}${suffix}`;
    
    const outputPath = options.output || defaultFilename;

    await fs.writeFile(outputPath, Buffer.from(data));

    console.log('');
    renderer.success(`Export complete: ${outputPath}`);
    renderer.dim(`Size: ${formatBytes(data.byteLength)}`);

    if (!options.plaintext) {
      renderer.dim('Archive is encrypted. Use `chorum import` to restore.');
    }

  } catch (err: any) {
    renderer.error(`Export failed: ${err.message}`);
  }
}

/**
 * IMPORT COMMAND
 */

interface ImportOptions {
  merge?: boolean;
  replace?: boolean;
}

export async function importCommand(
  file: string,
  options: ImportOptions,
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

  // Confirm replace
  if (options.replace) {
    renderer.warn('╔════════════════════════════════════════════════════════╗');
    renderer.warn('║  ⚠  REPLACE MODE WARNING                               ║');
    renderer.warn('╠════════════════════════════════════════════════════════╣');
    renderer.warn('║  This will DELETE all existing memory before import.   ║');
    renderer.warn('║  This action cannot be undone.                         ║');
    renderer.warn('╚════════════════════════════════════════════════════════╝');
    console.log('');

    const confirmed = await renderer.confirm('Continue with replace?');
    if (!confirmed) {
      renderer.info('Import cancelled.');
      return;
    }
  }

  try {
    await renderer.typeText('Reading archive...', 15);

    const data = await fs.readFile(file);

    // Prompt for passphrase if encrypted
    let passphrase: string | undefined;
    if (file.endsWith('.chorum')) {
      passphrase = await renderer.promptPassword('Import passphrase: ');
    }

    const result = await renderer.spinner(
      'Importing memory',
      chorumApi.importMemory(data.buffer as ArrayBuffer, {
        merge: options.merge,
        replace: options.replace,
      })
    );

    console.log('');
    renderer.success('Import complete!');
    renderer.print(`  Added: ${result.added}`);
    renderer.print(`  Skipped: ${result.skipped}`);
    
    if (result.conflicts.length > 0) {
      renderer.warn(`  Conflicts: ${result.conflicts.length}`);
      renderer.dim('  Run `chorum memory conflicts` to resolve.');
    }

  } catch (err: any) {
    renderer.error(`Import failed: ${err.message}`);
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
