
/**
 * MEMORY REPAIR COMMAND
 * 
 * Backfill missing embeddings for learning items.
 */

import { H4x0rRenderer } from '../renderer/h4x0r';
import { getConfig } from '../config';
import { chorumApi } from '../api/client';

export async function memoryRepairCommand(
    options: { project?: string },
    renderer: H4x0rRenderer
): Promise<void> {
    const config = await getConfig();

    if (!config.apiToken) {
        renderer.error('Not authenticated. Run `chorum login` first.');
        return;
    }

    renderer.warn('Starting memory repair...');
    renderer.dim('This process will generate embeddings for items that are missing them.');
    renderer.dim('It uses the CPU-based model (all-MiniLM-L6-v2) on the server.');
    renderer.dim('This might take a while depending on the number of items.\n');

    try {
        const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        let i = 0;
        const interval = setInterval(() => {
            process.stdout.write(`\r${spinner[i++ % spinner.length]} Repairing memory...`);
        }, 80);

        const result = await chorumApi.repairMemory({
            projectId: options.project
        });

        clearInterval(interval);
        process.stdout.write('\r'); // Clear line

        if (result.updated === 0 && result.failed === 0) {
            renderer.success('Memory is healthy. No items needed repair.');
        } else {
            console.log('');
            renderer.success(`Repair complete.`);
            renderer.print(`Updated: ${result.updated} items`);
            if (result.failed > 0) {
                renderer.error(`Failed: ${result.failed} items`);
            }
        }

    } catch (err: any) {
        renderer.error(`Repair failed: ${err.message}`);
    }
}
