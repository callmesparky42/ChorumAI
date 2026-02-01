"use strict";
/**
 * MEMORY REPAIR COMMAND
 *
 * Backfill missing embeddings for learning items.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryRepairCommand = memoryRepairCommand;
const config_1 = require("../config");
const client_1 = require("../api/client");
async function memoryRepairCommand(options, renderer) {
    const config = await (0, config_1.getConfig)();
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
        const result = await client_1.chorumApi.repairMemory({
            projectId: options.project
        });
        clearInterval(interval);
        process.stdout.write('\r'); // Clear line
        if (result.updated === 0 && result.failed === 0) {
            renderer.success('Memory is healthy. No items needed repair.');
        }
        else {
            console.log('');
            renderer.success(`Repair complete.`);
            renderer.print(`Updated: ${result.updated} items`);
            if (result.failed > 0) {
                renderer.error(`Failed: ${result.failed} items`);
            }
        }
    }
    catch (err) {
        renderer.error(`Repair failed: ${err.message}`);
    }
}
//# sourceMappingURL=memory-repair.js.map