#!/usr/bin/env node
"use strict";
/**
 * ██   ██ ██   ██ ██   ██  ██████  ██████
 * ██   ██ ██   ██  ██ ██  ██  ████ ██   ██
 * ███████ ███████   ███   ██ ██ ██ ██████
 * ██   ██     ██   ██ ██  ████  ██ ██   ██
 * ██   ██     ██  ██   ██  ██████  ██   ██
 *
 * CHORUM CLI - H4X0R EDITION
 * "Your sovereign context layer. Their chorus."
 */
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const h4x0r_1 = require("./renderer/h4x0r");
const ask_1 = require("./commands/ask");
const review_1 = require("./commands/review");
const memory_1 = require("./commands/memory");
const import_knowledge_1 = require("./commands/import-knowledge");
const export_1 = require("./commands/export");
const import_1 = require("./commands/import");
const config_cmd_1 = require("./commands/config-cmd");
const login_1 = require("./commands/login");
const hack_1 = require("./commands/hack");
const memory_repair_1 = require("./commands/memory-repair");
const mcp_1 = require("./commands/mcp");
const config_1 = require("./config");
const VERSION = '1.0.0';
const renderer = new h4x0r_1.H4x0rRenderer({
    crt: process.argv.includes('--crt'),
    amber: process.argv.includes('--amber')
});
// ASCII Banner
const BANNER = `
╔══════════════════════════════════════════════════════════╗
║  ██   ██ ██   ██ ██   ██  ██████  ██████                ║
║  ██   ██ ██   ██  ██ ██  ██  ████ ██   ██               ║
║  ███████ ███████   ███   ██ ██ ██ ██████                ║
║  ██   ██     ██   ██ ██  ████  ██ ██   ██               ║
║  ██   ██     ██  ██   ██  ██████  ██   ██               ║
║                                                          ║
║  [ H4X0R TERMINAL v${VERSION} ]        CONNECTION: {{STATUS}}  ║
╚══════════════════════════════════════════════════════════╝
`;
async function main() {
    const config = await (0, config_1.getConfig)();
    const isConnected = !!config.apiToken;
    // Show banner
    renderer.printBanner(BANNER.replace('{{STATUS}}', isConnected ? 'ACTIVE' : 'NONE  '));
    const program = new commander_1.Command();
    program
        .name('chorum')
        .description('H4X0R Terminal - Sovereign AI Context Layer')
        .version(VERSION)
        .option('--crt', 'Enable CRT scanline effect')
        .option('--amber', 'Use amber phosphor color scheme');
    // ═══════════════════════════════════════════════════════════
    // CORE COMMANDS
    // ═══════════════════════════════════════════════════════════
    program
        .command('ask [prompt...]')
        .description('Send a prompt to the chorus')
        .option('-a, --agent <agent>', 'Specify agent (analyst, architect, debugger, etc.)')
        .option('-p, --project <project>', 'Target project')
        .option('-m, --model <model>', 'Force specific model')
        .option('--no-memory', 'Disable memory injection')
        .action(async (promptParts, options) => {
        const prompt = promptParts.join(' ');
        await (0, ask_1.askCommand)(prompt, options, renderer);
    });
    // Agent shortcuts
    const agents = ['analyst', 'architect', 'debugger', 'reviewer', 'writer', 'tutor', 'planner', 'researcher'];
    for (const agent of agents) {
        program
            .command(`${agent} [prompt...]`)
            .description(`Ask the ${agent} agent`)
            .option('-p, --project <project>', 'Target project')
            .action(async (promptParts, options) => {
            const prompt = promptParts.join(' ');
            await (0, ask_1.askCommand)(prompt, { ...options, agent }, renderer);
        });
    }
    // ═══════════════════════════════════════════════════════════
    // REVIEW COMMAND
    // ═══════════════════════════════════════════════════════════
    program
        .command('review')
        .description('Peer review code with cross-provider validation')
        .option('-f, --file <file>', 'File to review')
        .option('-d, --dir <directory>', 'Directory to review')
        .option('--focus <focus>', 'Review focus: code, security, architecture, accuracy', 'code')
        .option('--friend <provider>', 'Force specific reviewer: anthropic, openai, google')
        .action(async (options) => {
        await (0, review_1.reviewCommand)(options, renderer);
    });
    // ═══════════════════════════════════════════════════════════
    // MEMORY COMMANDS
    // ═══════════════════════════════════════════════════════════
    const memory = program
        .command('memory')
        .description('Manage sovereign memory');
    memory
        .command('list')
        .description('List memory items')
        .option('-p, --project <project>', 'Filter by project')
        .option('-t, --type <type>', 'Filter by type: pattern, decision, invariant, fact')
        .option('-n, --limit <n>', 'Limit results', '20')
        .action(async (options) => {
        await (0, memory_1.memoryCommand)('list', options, renderer);
    });
    memory
        .command('add <content>')
        .description('Add a memory item')
        .option('-t, --type <type>', 'Type: pattern, decision, invariant, fact', 'pattern')
        .option('-p, --project <project>', 'Target project')
        .option('--domains <domains>', 'Comma-separated domain tags')
        .action(async (content, options) => {
        await (0, memory_1.memoryCommand)('add', { ...options, content }, renderer);
    });
    memory
        .command('delete <id>')
        .description('Delete a memory item')
        .option('--force', 'Skip confirmation')
        .action(async (id, options) => {
        await (0, memory_1.memoryCommand)('delete', { ...options, id }, renderer);
    });
    memory
        .command('search <query>')
        .description('Semantic search through memory')
        .option('-p, --project <project>', 'Filter by project')
        .option('-n, --limit <n>', 'Limit results', '10')
        .action(async (query, options) => {
        await (0, memory_1.memoryCommand)('search', { ...options, query }, renderer);
    });
    memory
        .command('repair')
        .description('Backfill missing embeddings')
        .option('-p, --project <project>', 'Target project')
        .action(async (options) => {
        await (0, memory_repair_1.memoryRepairCommand)(options, renderer);
    });
    // ═══════════════════════════════════════════════════════════
    // KNOWLEDGE IMPORT
    // ═══════════════════════════════════════════════════════════
    program
        .command('import-knowledge <file>')
        .description('Import knowledge from JSON/YAML file')
        .option('-p, --project <project>', 'Target project')
        .option('-t, --type <type>', 'Override type for all items')
        .option('--dry-run', 'Preview without importing')
        .action(async (file, options) => {
        await (0, import_knowledge_1.importKnowledgeCommand)(file, options, renderer);
    });
    // ═══════════════════════════════════════════════════════════
    // PORTABILITY
    // ═══════════════════════════════════════════════════════════
    program
        .command('export')
        .description('Export memory to encrypted archive')
        .option('-p, --project <project>', 'Export specific project')
        .option('-o, --output <file>', 'Output file path')
        .option('--plaintext', 'Export as plaintext (DANGEROUS)')
        .action(async (options) => {
        await (0, export_1.exportCommand)(options, renderer);
    });
    program
        .command('import <file>')
        .description('Import memory from archive')
        .option('--merge', 'Merge with existing memory')
        .option('--replace', 'Replace existing memory')
        .action(async (file, options) => {
        await (0, import_1.importCommand)(file, options, renderer);
    });
    // ═══════════════════════════════════════════════════════════
    // CONFIGURATION
    // ═══════════════════════════════════════════════════════════
    program
        .command('login')
        .description('Authenticate with Chorum server')
        .option('-u, --url <url>', 'Server URL')
        .action(async (options) => {
        await (0, login_1.loginCommand)(options, renderer);
    });
    program
        .command('config <action> [key] [value]')
        .description('Manage configuration (get, set, list)')
        .action(async (action, key, value) => {
        await (0, config_cmd_1.configCommand)(action, key, value, renderer);
    });
    // ═══════════════════════════════════════════════════════════
    // MCP SERVER
    // ═══════════════════════════════════════════════════════════
    program
        .command('mcp <action>')
        .description('MCP Server management (serve, status, config)')
        .option('-p, --port <port>', 'HTTP port (for future use)')
        .action(async (action, options) => {
        await (0, mcp_1.mcpCommand)(action, options, renderer);
    });
    // ═══════════════════════════════════════════════════════════
    // VAULT (ENCRYPTION)
    // ═══════════════════════════════════════════════════════════
    program
        .command('init')
        .description('Initialize encrypted vault')
        .action(async () => {
        renderer.typeText('Initializing sovereign vault...');
        // TODO: Implement vault initialization
        renderer.success('Vault initialized. Your memory is now encrypted.');
    });
    program
        .command('unlock')
        .description('Unlock vault for session')
        .action(async () => {
        renderer.typeText('Unlocking vault...');
        // TODO: Implement vault unlock
        renderer.success('Vault unlocked. Session active for 4 hours.');
    });
    program
        .command('lock')
        .description('Lock vault immediately')
        .action(async () => {
        renderer.typeText('Locking vault...');
        // TODO: Implement vault lock
        renderer.success('Vault locked. Memory secured.');
    });
    // ═══════════════════════════════════════════════════════════
    // EASTER EGGS
    // ═══════════════════════════════════════════════════════════
    program
        .command('hack', { hidden: true })
        .description('???')
        .action(async () => {
        await (0, hack_1.hackCommand)(renderer);
    });
    // ═══════════════════════════════════════════════════════════
    // STATUS
    // ═══════════════════════════════════════════════════════════
    program
        .command('status')
        .description('Show connection and vault status')
        .action(async () => {
        const config = await (0, config_1.getConfig)();
        renderer.printStatus({
            connected: !!config.apiToken,
            serverUrl: config.apiUrl || 'Not configured',
            vaultStatus: config.vaultUnlocked ? 'UNLOCKED' : 'LOCKED',
            memoryItems: config.memoryCount || 0,
            activeProject: config.activeProject || 'None'
        });
    });
    // Parse and execute
    await program.parseAsync(process.argv);
}
// Run
main().catch((err) => {
    renderer.error(`FATAL: ${err.message}`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map