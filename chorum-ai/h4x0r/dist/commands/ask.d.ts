/**
 * ASK COMMAND
 *
 * Send prompts to the chorus. Route through agents.
 */
import { H4x0rRenderer } from '../renderer/h4x0r';
interface AskOptions {
    agent?: string;
    project?: string;
    model?: string;
    memory?: boolean;
}
export declare function askCommand(prompt: string, options: AskOptions, renderer: H4x0rRenderer): Promise<void>;
export {};
//# sourceMappingURL=ask.d.ts.map