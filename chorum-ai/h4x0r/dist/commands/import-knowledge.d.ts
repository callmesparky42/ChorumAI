/**
 * IMPORT-KNOWLEDGE COMMAND
 *
 * Import knowledge from JSON/YAML files.
 * Bulk load patterns, decisions, invariants.
 */
import { H4x0rRenderer } from '../renderer/h4x0r';
interface ImportKnowledgeOptions {
    project?: string;
    type?: string;
    dryRun?: boolean;
}
export declare function importKnowledgeCommand(file: string, options: ImportKnowledgeOptions, renderer: H4x0rRenderer): Promise<void>;
export {};
//# sourceMappingURL=import-knowledge.d.ts.map