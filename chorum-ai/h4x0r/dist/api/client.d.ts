/**
 * CHORUM API CLIENT
 *
 * Communicates with the Chorum web server.
 * Handles authentication, streaming, and error handling.
 */
interface ChatRequest {
    prompt: string;
    agent?: string;
    projectId?: string;
    forceModel?: string;
    injectMemory?: boolean;
}
interface ChatResponse {
    content: string;
    provider: string;
    model: string;
    tokensInput: number;
    tokensOutput: number;
    costUsd?: number;
    memoryInjected?: number;
    wasFallback?: boolean;
    failedProviders?: string[];
}
interface StreamCallbacks {
    onChunk?: (chunk: string) => void;
    onError?: (error: Error) => void;
    onComplete?: (response: ChatResponse) => void;
}
interface MemoryItem {
    id: string;
    type: 'pattern' | 'decision' | 'invariant' | 'fact';
    content: string;
    domains?: string[];
    createdAt: string;
    updatedAt: string;
}
declare class ChorumApiClient {
    private baseUrl;
    private token;
    init(): Promise<void>;
    private ensureInit;
    private getHeaders;
    /**
     * Chat with streaming support
     */
    chat(request: ChatRequest, callbacks: StreamCallbacks): Promise<ChatResponse>;
    /**
     * Handle SSE stream
     */
    private handleStream;
    /**
     * Review code
     */
    review(request: {
        content: string;
        focus: string;
        friend?: string;
    }): Promise<any>;
    /**
     * List memory items
     */
    listMemory(options: {
        projectId?: string;
        type?: string;
        limit?: number;
    }): Promise<MemoryItem[]>;
    /**
     * Add memory item
     */
    addMemory(item: {
        content: string;
        type: string;
        projectId?: string;
        domains?: string[];
    }): Promise<MemoryItem>;
    /**
     * Delete memory item
     */
    deleteMemory(id: string): Promise<void>;
    /**
     * Search memory
     */
    searchMemory(query: string, options: {
        projectId?: string;
        limit?: number;
    }): Promise<MemoryItem[]>;
    /**
     * Export memory
     */
    exportMemory(options: {
        projectId?: string;
        plaintext?: boolean;
    }): Promise<ArrayBuffer>;
    /**
     * Import memory
     */
    importMemory(data: ArrayBuffer, options: {
        merge?: boolean;
        replace?: boolean;
    }): Promise<{
        added: number;
        skipped: number;
        conflicts: any[];
    }>;
    /**
     * Login and get token
     */
    login(credentials: {
        email?: string;
        password?: string;
        oauthCode?: string;
    }): Promise<{
        token: string;
        expiresAt: string;
    }>;
    /**
     * Get server status
     */
    status(): Promise<{
        version: string;
        memoryCount: number;
        providersConfigured: string[];
    }>;
}
export declare const chorumApi: ChorumApiClient;
export {};
//# sourceMappingURL=client.d.ts.map