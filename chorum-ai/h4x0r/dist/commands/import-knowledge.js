"use strict";
/**
 * IMPORT-KNOWLEDGE COMMAND
 *
 * Import knowledge from JSON/YAML files.
 * Bulk load patterns, decisions, invariants.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.importKnowledgeCommand = importKnowledgeCommand;
const fs = __importStar(require("fs/promises"));
const yaml = __importStar(require("yaml"));
const config_1 = require("../config");
const client_1 = require("../api/client");
async function importKnowledgeCommand(file, options, renderer) {
    const config = await (0, config_1.getConfig)();
    if (!config.apiToken) {
        renderer.error('Not authenticated. Run `chorum login` first.');
        return;
    }
    // Check file exists
    try {
        await fs.access(file);
    }
    catch {
        renderer.error(`File not found: ${file}`);
        return;
    }
    try {
        await renderer.typeText('Parsing knowledge file...', 15);
        const content = await fs.readFile(file, 'utf-8');
        // Parse based on extension
        let knowledge;
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
            knowledge = yaml.parse(content);
        }
        else if (file.endsWith('.json')) {
            knowledge = JSON.parse(content);
        }
        else {
            renderer.error('Unsupported file format. Use .json or .yaml');
            return;
        }
        // Collect all items
        const items = [];
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
        renderer.table(['TYPE', 'CONTENT', 'DOMAINS'], items.slice(0, 10).map(({ type, item }) => [
            type.toUpperCase(),
            truncate(item.content, 40),
            item.domains?.join(', ') || '-',
        ]));
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
                await client_1.chorumApi.addMemory({
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
            }
            catch (err) {
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
    }
    catch (err) {
        if (err.name === 'SyntaxError') {
            renderer.error(`Invalid file format: ${err.message}`);
        }
        else {
            renderer.error(`Import failed: ${err.message}`);
        }
    }
}
function truncate(str, maxLen) {
    if (str.length <= maxLen)
        return str;
    return str.slice(0, maxLen - 3) + '...';
}
//# sourceMappingURL=import-knowledge.js.map