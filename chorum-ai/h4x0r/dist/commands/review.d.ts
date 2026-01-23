/**
 * REVIEW COMMAND
 *
 * Peer review code with cross-provider validation.
 * "Phone a Friend" from the terminal.
 */
import { H4x0rRenderer } from '../renderer/h4x0r';
interface ReviewOptions {
    file?: string;
    dir?: string;
    focus: string;
    friend?: string;
}
export declare function reviewCommand(options: ReviewOptions, renderer: H4x0rRenderer): Promise<void>;
export {};
//# sourceMappingURL=review.d.ts.map