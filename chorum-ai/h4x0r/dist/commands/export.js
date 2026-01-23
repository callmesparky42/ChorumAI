"use strict";
/**
 * EXPORT COMMAND
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
exports.exportCommand = exportCommand;
exports.importCommand = importCommand;
const fs = __importStar(require("fs/promises"));
const config_1 = require("../config");
const client_1 = require("../api/client");
async function exportCommand(options, renderer) {
    const config = await (0, config_1.getConfig)();
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
        const data = await renderer.spinner('Exporting memory', client_1.chorumApi.exportMemory({
            projectId: options.project,
            plaintext: options.plaintext,
        }));
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
    }
    catch (err) {
        renderer.error(`Export failed: ${err.message}`);
    }
}
async function importCommand(file, options, renderer) {
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
        let passphrase;
        if (file.endsWith('.chorum')) {
            passphrase = await renderer.promptPassword('Import passphrase: ');
        }
        const result = await renderer.spinner('Importing memory', client_1.chorumApi.importMemory(data.buffer, {
            merge: options.merge,
            replace: options.replace,
        }));
        console.log('');
        renderer.success('Import complete!');
        renderer.print(`  Added: ${result.added}`);
        renderer.print(`  Skipped: ${result.skipped}`);
        if (result.conflicts.length > 0) {
            renderer.warn(`  Conflicts: ${result.conflicts.length}`);
            renderer.dim('  Run `chorum memory conflicts` to resolve.');
        }
    }
    catch (err) {
        renderer.error(`Import failed: ${err.message}`);
    }
}
function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
//# sourceMappingURL=export.js.map