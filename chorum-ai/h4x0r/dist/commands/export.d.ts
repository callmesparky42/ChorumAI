/**
 * EXPORT COMMAND
 */
import { H4x0rRenderer } from '../renderer/h4x0r';
interface ExportOptions {
    project?: string;
    output?: string;
    plaintext?: boolean;
}
export declare function exportCommand(options: ExportOptions, renderer: H4x0rRenderer): Promise<void>;
/**
 * IMPORT COMMAND
 */
interface ImportOptions {
    merge?: boolean;
    replace?: boolean;
}
export declare function importCommand(file: string, options: ImportOptions, renderer: H4x0rRenderer): Promise<void>;
export {};
//# sourceMappingURL=export.d.ts.map