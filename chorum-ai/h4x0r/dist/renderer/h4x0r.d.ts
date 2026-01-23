/**
 * H4X0R RENDERER
 *
 * Retro terminal aesthetics for the discerning hacker.
 * Green phosphor, amber warnings, CRT scanlines optional.
 */
interface RendererOptions {
    crt?: boolean;
    amber?: boolean;
    typingSpeed?: number;
}
interface StatusInfo {
    connected: boolean;
    serverUrl: string;
    vaultStatus: string;
    memoryItems: number;
    activeProject: string;
}
export declare class H4x0rRenderer {
    private colors;
    private crtEnabled;
    private typingSpeed;
    constructor(options?: RendererOptions);
    /**
     * Print text with green color
     */
    print(text: string): void;
    /**
     * Print with typing animation
     */
    typeText(text: string, speed?: number): Promise<void>;
    /**
     * Print success message
     */
    success(text: string): void;
    /**
     * Print warning message
     */
    warn(text: string): void;
    /**
     * Print error message
     */
    error(text: string): void;
    /**
     * Print info message
     */
    info(text: string): void;
    /**
     * Print dim/metadata text
     */
    dim(text: string): void;
    /**
     * Print the H4X0R banner
     */
    printBanner(banner: string): void;
    /**
     * Print status block
     */
    printStatus(status: StatusInfo): void;
    /**
     * Show a spinner while waiting
     */
    spinner(text: string, promise: Promise<any>): Promise<any>;
    /**
     * Progress bar
     */
    progressBar(current: number, total: number, width?: number): string;
    /**
     * Start streaming output
     */
    startStream(): void;
    /**
     * Write chunk to stream
     */
    writeChunk(chunk: string): void;
    /**
     * End streaming output
     */
    endStream(): void;
    /**
     * Print a table
     */
    table(headers: string[], rows: string[][]): void;
    /**
     * Print a list
     */
    list(items: string[], bullet?: string): void;
    /**
     * Prompt for input
     */
    prompt(question: string): Promise<string>;
    /**
     * Prompt for password (hidden input)
     */
    promptPassword(question: string): Promise<string>;
    /**
     * Confirm yes/no
     */
    confirm(question: string, defaultYes?: boolean): Promise<boolean>;
    /**
     * Matrix-style text rain (for hack command)
     */
    matrixRain(duration?: number): Promise<void>;
    /**
     * Fake "hacking" animation
     */
    fakeHack(): Promise<void>;
    /**
     * Glitch text effect
     */
    glitchText(text: string, iterations?: number): Promise<void>;
    /**
     * Apply CRT scanline effect to output
     * (Note: This is a visual hint, true CRT would need terminal emulator support)
     */
    crtLine(text: string): string;
    private sleep;
    private padRight;
    private colorize;
    private colorizeStatus;
}
export {};
//# sourceMappingURL=h4x0r.d.ts.map