"use strict";
/**
 * H4X0R RENDERER
 *
 * Retro terminal aesthetics for the discerning hacker.
 * Green phosphor, amber warnings, CRT scanlines optional.
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
exports.H4x0rRenderer = void 0;
const readline = __importStar(require("readline"));
// ANSI color codes
const COLORS = {
    // Standard H4X0R green
    green: '\x1b[38;2;0;255;0m',
    greenBright: '\x1b[38;2;50;255;50m',
    greenDim: '\x1b[38;2;0;180;0m',
    // Amber warnings
    amber: '\x1b[38;2;255;176;0m',
    amberBright: '\x1b[38;2;255;200;50m',
    // Red errors
    red: '\x1b[38;2;255;50;50m',
    redBright: '\x1b[38;2;255;100;100m',
    // Cyan accents
    cyan: '\x1b[38;2;0;255;255m',
    // Dim for metadata
    dim: '\x1b[2m',
    // Reset
    reset: '\x1b[0m',
    // Bold
    bold: '\x1b[1m',
};
// Amber color scheme (alternative)
const AMBER_COLORS = {
    green: '\x1b[38;2;255;176;0m',
    greenBright: '\x1b[38;2;255;200;50m',
    greenDim: '\x1b[38;2;200;140;0m',
    amber: '\x1b[38;2;255;100;0m',
    amberBright: '\x1b[38;2;255;150;50m',
    red: '\x1b[38;2;255;50;50m',
    redBright: '\x1b[38;2;255;100;100m',
    cyan: '\x1b[38;2;255;220;100m',
    dim: '\x1b[2m',
    reset: '\x1b[0m',
    bold: '\x1b[1m',
};
class H4x0rRenderer {
    colors;
    crtEnabled;
    typingSpeed;
    constructor(options = {}) {
        this.colors = options.amber ? AMBER_COLORS : COLORS;
        this.crtEnabled = options.crt || false;
        this.typingSpeed = options.typingSpeed || 10;
    }
    // ═══════════════════════════════════════════════════════════
    // CORE OUTPUT METHODS
    // ═══════════════════════════════════════════════════════════
    /**
     * Print text with green color
     */
    print(text) {
        console.log(`${this.colors.green}${text}${this.colors.reset}`);
    }
    /**
     * Print with typing animation
     */
    async typeText(text, speed) {
        const chars = text.split('');
        const delay = speed || this.typingSpeed;
        process.stdout.write(this.colors.green);
        for (const char of chars) {
            process.stdout.write(char);
            await this.sleep(delay);
        }
        process.stdout.write(this.colors.reset + '\n');
    }
    /**
     * Print success message
     */
    success(text) {
        console.log(`${this.colors.greenBright}✓ ${text}${this.colors.reset}`);
    }
    /**
     * Print warning message
     */
    warn(text) {
        console.log(`${this.colors.amber}⚠ ${text}${this.colors.reset}`);
    }
    /**
     * Print error message
     */
    error(text) {
        console.log(`${this.colors.red}✗ ${text}${this.colors.reset}`);
    }
    /**
     * Print info message
     */
    info(text) {
        console.log(`${this.colors.cyan}ℹ ${text}${this.colors.reset}`);
    }
    /**
     * Print dim/metadata text
     */
    dim(text) {
        console.log(`${this.colors.dim}${this.colors.green}${text}${this.colors.reset}`);
    }
    // ═══════════════════════════════════════════════════════════
    // BANNER & STATUS
    // ═══════════════════════════════════════════════════════════
    /**
     * Print the H4X0R banner
     */
    printBanner(banner) {
        const lines = banner.split('\n');
        for (const line of lines) {
            if (line.includes('CONNECTION: ACTIVE')) {
                // Highlight active connection
                console.log(`${this.colors.green}${line.replace('ACTIVE', `${this.colors.greenBright}ACTIVE${this.colors.green}`)}${this.colors.reset}`);
            }
            else if (line.includes('CONNECTION: NONE')) {
                // Warn on no connection
                console.log(`${this.colors.green}${line.replace('NONE', `${this.colors.amber}NONE${this.colors.green}`)}${this.colors.reset}`);
            }
            else {
                console.log(`${this.colors.green}${line}${this.colors.reset}`);
            }
        }
    }
    /**
     * Print status block
     */
    printStatus(status) {
        const box = `
╔════════════════════════════════════════╗
║  SYSTEM STATUS                         ║
╠════════════════════════════════════════╣
║  Server:    ${this.padRight(status.serverUrl, 26)}║
║  Connected: ${status.connected ? this.colorize('YES', 'greenBright') : this.colorize('NO ', 'amber')}                       ║
║  Vault:     ${this.colorizeStatus(status.vaultStatus)}                  ║
║  Memory:    ${this.padRight(status.memoryItems + ' items', 26)}║
║  Project:   ${this.padRight(status.activeProject, 26)}║
╚════════════════════════════════════════╝
`;
        this.print(box);
    }
    // ═══════════════════════════════════════════════════════════
    // PROGRESS & LOADING
    // ═══════════════════════════════════════════════════════════
    /**
     * Show a spinner while waiting
     */
    async spinner(text, promise) {
        const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        let i = 0;
        const interval = setInterval(() => {
            process.stdout.write(`\r${this.colors.green}${frames[i]} ${text}${this.colors.reset}`);
            i = (i + 1) % frames.length;
        }, 80);
        try {
            const result = await promise;
            clearInterval(interval);
            process.stdout.write(`\r${this.colors.greenBright}✓ ${text}${this.colors.reset}\n`);
            return result;
        }
        catch (err) {
            clearInterval(interval);
            process.stdout.write(`\r${this.colors.red}✗ ${text}${this.colors.reset}\n`);
            throw err;
        }
    }
    /**
     * Progress bar
     */
    progressBar(current, total, width = 30) {
        const progress = Math.floor((current / total) * width);
        const bar = '█'.repeat(progress) + '░'.repeat(width - progress);
        const percent = Math.floor((current / total) * 100);
        return `[${bar}] ${percent}%`;
    }
    // ═══════════════════════════════════════════════════════════
    // STREAMING OUTPUT (for LLM responses)
    // ═══════════════════════════════════════════════════════════
    /**
     * Start streaming output
     */
    startStream() {
        process.stdout.write(this.colors.green);
    }
    /**
     * Write chunk to stream
     */
    writeChunk(chunk) {
        process.stdout.write(chunk);
    }
    /**
     * End streaming output
     */
    endStream() {
        process.stdout.write(this.colors.reset + '\n');
    }
    // ═══════════════════════════════════════════════════════════
    // TABLES & LISTS
    // ═══════════════════════════════════════════════════════════
    /**
     * Print a table
     */
    table(headers, rows) {
        // Calculate column widths
        const widths = headers.map((h, i) => {
            const maxRow = Math.max(...rows.map(r => (r[i] || '').length));
            return Math.max(h.length, maxRow);
        });
        // Header
        const headerLine = headers.map((h, i) => this.padRight(h, widths[i])).join(' │ ');
        const separator = widths.map(w => '─'.repeat(w)).join('─┼─');
        console.log(`${this.colors.greenBright}${headerLine}${this.colors.reset}`);
        console.log(`${this.colors.greenDim}${separator}${this.colors.reset}`);
        // Rows
        for (const row of rows) {
            const rowLine = row.map((cell, i) => this.padRight(cell || '', widths[i])).join(' │ ');
            console.log(`${this.colors.green}${rowLine}${this.colors.reset}`);
        }
    }
    /**
     * Print a list
     */
    list(items, bullet = '▸') {
        for (const item of items) {
            console.log(`${this.colors.green}  ${bullet} ${item}${this.colors.reset}`);
        }
    }
    // ═══════════════════════════════════════════════════════════
    // INPUT
    // ═══════════════════════════════════════════════════════════
    /**
     * Prompt for input
     */
    async prompt(question) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        return new Promise((resolve) => {
            rl.question(`${this.colors.green}${question}${this.colors.reset}`, (answer) => {
                rl.close();
                resolve(answer);
            });
        });
    }
    /**
     * Prompt for password (hidden input)
     */
    async promptPassword(question) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        return new Promise((resolve) => {
            process.stdout.write(`${this.colors.green}${question}${this.colors.reset}`);
            const stdin = process.stdin;
            stdin.setRawMode?.(true);
            stdin.resume();
            stdin.setEncoding('utf8');
            let password = '';
            const onData = (char) => {
                if (char === '\n' || char === '\r') {
                    stdin.setRawMode?.(false);
                    stdin.removeListener('data', onData);
                    process.stdout.write('\n');
                    rl.close();
                    resolve(password);
                }
                else if (char === '\u0003') {
                    // Ctrl+C
                    process.exit();
                }
                else if (char === '\u007F') {
                    // Backspace
                    if (password.length > 0) {
                        password = password.slice(0, -1);
                        process.stdout.write('\b \b');
                    }
                }
                else {
                    password += char;
                    process.stdout.write('*');
                }
            };
            stdin.on('data', onData);
        });
    }
    /**
     * Confirm yes/no
     */
    async confirm(question, defaultYes = false) {
        const hint = defaultYes ? '[Y/n]' : '[y/N]';
        const answer = await this.prompt(`${question} ${hint} `);
        if (answer === '')
            return defaultYes;
        return answer.toLowerCase().startsWith('y');
    }
    // ═══════════════════════════════════════════════════════════
    // SPECIAL EFFECTS
    // ═══════════════════════════════════════════════════════════
    /**
     * Matrix-style text rain (for hack command)
     */
    async matrixRain(duration = 3000) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()アイウエオカキクケコ';
        const width = process.stdout.columns || 80;
        const height = process.stdout.rows || 24;
        const columns = new Array(width).fill(0);
        const startTime = Date.now();
        // Hide cursor
        process.stdout.write('\x1b[?25l');
        while (Date.now() - startTime < duration) {
            let output = '';
            for (let x = 0; x < width; x++) {
                if (Math.random() > 0.95) {
                    columns[x] = 0;
                }
                const y = columns[x];
                if (y < height) {
                    const char = chars[Math.floor(Math.random() * chars.length)];
                    output += `\x1b[${y};${x}H${this.colors.greenBright}${char}`;
                    if (y > 0) {
                        const dimChar = chars[Math.floor(Math.random() * chars.length)];
                        output += `\x1b[${y - 1};${x}H${this.colors.greenDim}${dimChar}`;
                    }
                    columns[x]++;
                }
            }
            process.stdout.write(output);
            await this.sleep(50);
        }
        // Show cursor and clear
        process.stdout.write('\x1b[?25h');
        process.stdout.write('\x1b[2J\x1b[H');
    }
    /**
     * Fake "hacking" animation
     */
    async fakeHack() {
        const messages = [
            'Initializing neural handshake...',
            'Bypassing firewall protocols...',
            'Injecting polymorphic shellcode...',
            'Decrypting quantum keys...',
            'Establishing root access...',
            'Downloading Gibson mainframe...',
            'Rerouting through proxy chain...',
            'Compiling zero-day exploit...',
            'Penetrating ICE barrier...',
            'ACCESS GRANTED',
        ];
        for (const msg of messages) {
            if (msg === 'ACCESS GRANTED') {
                await this.sleep(500);
                console.log(`\n${this.colors.greenBright}█▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█`);
                console.log(`█  ${this.colors.bold}ACCESS GRANTED${this.colors.reset}${this.colors.greenBright}         █`);
                console.log(`█▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄█${this.colors.reset}`);
            }
            else {
                await this.typeText(`[*] ${msg}`, 15);
                await this.sleep(Math.random() * 300 + 100);
            }
        }
    }
    /**
     * Glitch text effect
     */
    async glitchText(text, iterations = 10) {
        const glitchChars = '!@#$%^&*()_+-=[]{}|;:,.<>?█▓▒░';
        for (let i = 0; i < iterations; i++) {
            let glitched = '';
            for (const char of text) {
                if (Math.random() > 0.7) {
                    glitched += glitchChars[Math.floor(Math.random() * glitchChars.length)];
                }
                else {
                    glitched += char;
                }
            }
            process.stdout.write(`\r${this.colors.green}${glitched}${this.colors.reset}`);
            await this.sleep(50);
        }
        process.stdout.write(`\r${this.colors.green}${text}${this.colors.reset}\n`);
    }
    // ═══════════════════════════════════════════════════════════
    // CRT EFFECT
    // ═══════════════════════════════════════════════════════════
    /**
     * Apply CRT scanline effect to output
     * (Note: This is a visual hint, true CRT would need terminal emulator support)
     */
    crtLine(text) {
        if (!this.crtEnabled)
            return text;
        // Add subtle dimming to simulate scanlines
        const lines = text.split('\n');
        return lines.map((line, i) => {
            if (i % 2 === 0) {
                return `${this.colors.dim}${line}${this.colors.reset}`;
            }
            return line;
        }).join('\n');
    }
    // ═══════════════════════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════════════════════
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    padRight(str, len) {
        return str.padEnd(len);
    }
    colorize(text, color) {
        return `${this.colors[color]}${text}${this.colors.green}`;
    }
    colorizeStatus(status) {
        if (status === 'UNLOCKED') {
            return `${this.colors.greenBright}UNLOCKED${this.colors.green}`;
        }
        else if (status === 'LOCKED') {
            return `${this.colors.amber}LOCKED  ${this.colors.green}`;
        }
        return status;
    }
}
exports.H4x0rRenderer = H4x0rRenderer;
//# sourceMappingURL=h4x0r.js.map