/**
 * MEMORY COMMAND
 *
 * Manage sovereign memory from the terminal.
 * List, add, delete, search.
 */
import { H4x0rRenderer } from '../renderer/h4x0r';
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
export declare function memoryCommand(action: 'list' | 'add' | 'delete' | 'search', options: MemoryOptions, renderer: H4x0rRenderer): Promise<void>;
export {};
//# sourceMappingURL=memory.d.ts.map