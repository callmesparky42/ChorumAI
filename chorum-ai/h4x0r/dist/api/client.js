"use strict";
/**
 * CHORUM API CLIENT
 *
 * Communicates with the Chorum web server.
 * Handles authentication, streaming, and error handling.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.chorumApi = void 0;
const config_1 = require("../config");
class ChorumApiClient {
    baseUrl = '';
    token = '';
    async init() {
        const config = await (0, config_1.getConfig)();
        this.baseUrl = config.apiUrl || 'http://localhost:3000';
        this.token = config.apiToken || '';
    }
    async ensureInit() {
        if (!this.baseUrl) {
            await this.init();
        }
    }
    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`,
        };
    }
    /**
     * Chat with streaming support
     */
    async chat(request, callbacks) {
        await this.ensureInit();
        const response = await fetch(`${this.baseUrl}/api/cli/chat`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(request),
        });
        if (!response.ok) {
            const error = new Error(await response.text());
            error.status = response.status;
            throw error;
        }
        // Handle streaming response
        if (response.headers.get('content-type')?.includes('text/event-stream')) {
            return this.handleStream(response, callbacks);
        }
        // Handle non-streaming response
        const data = await response.json();
        callbacks.onChunk?.(data.content);
        callbacks.onComplete?.(data);
        return data;
    }
    /**
     * Handle SSE stream
     */
    async handleStream(response, callbacks) {
        const reader = response.body?.getReader();
        if (!reader)
            throw new Error('No response body');
        const decoder = new TextDecoder();
        let buffer = '';
        let finalResponse = null;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            continue;
                        }
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.type === 'chunk') {
                                callbacks.onChunk?.(parsed.content);
                            }
                            else if (parsed.type === 'complete') {
                                finalResponse = parsed;
                                callbacks.onComplete?.(parsed);
                            }
                            else if (parsed.type === 'error') {
                                throw new Error(parsed.message);
                            }
                        }
                        catch (e) {
                            // Not JSON, treat as raw chunk
                            callbacks.onChunk?.(data);
                        }
                    }
                }
            }
        }
        finally {
            reader.releaseLock();
        }
        if (!finalResponse) {
            throw new Error('Stream ended without completion');
        }
        return finalResponse;
    }
    /**
     * Review code
     */
    async review(request) {
        await this.ensureInit();
        const response = await fetch(`${this.baseUrl}/api/cli/review`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(request),
        });
        if (!response.ok) {
            const error = new Error(await response.text());
            error.status = response.status;
            throw error;
        }
        return response.json();
    }
    /**
     * List memory items
     */
    async listMemory(options) {
        await this.ensureInit();
        const params = new URLSearchParams();
        if (options.projectId)
            params.append('projectId', options.projectId);
        if (options.type)
            params.append('type', options.type);
        if (options.limit)
            params.append('limit', options.limit.toString());
        const response = await fetch(`${this.baseUrl}/api/cli/memory?${params}`, {
            headers: this.getHeaders(),
        });
        if (!response.ok) {
            const error = new Error(await response.text());
            error.status = response.status;
            throw error;
        }
        return response.json();
    }
    /**
     * Add memory item
     */
    async addMemory(item) {
        await this.ensureInit();
        const response = await fetch(`${this.baseUrl}/api/cli/memory`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(item),
        });
        if (!response.ok) {
            const error = new Error(await response.text());
            error.status = response.status;
            throw error;
        }
        return response.json();
    }
    /**
     * Delete memory item
     */
    async deleteMemory(id) {
        await this.ensureInit();
        const response = await fetch(`${this.baseUrl}/api/cli/memory/${id}`, {
            method: 'DELETE',
            headers: this.getHeaders(),
        });
        if (!response.ok) {
            const error = new Error(await response.text());
            error.status = response.status;
            throw error;
        }
    }
    /**
     * Search memory
     */
    async searchMemory(query, options) {
        await this.ensureInit();
        const params = new URLSearchParams({ query });
        if (options.projectId)
            params.append('projectId', options.projectId);
        if (options.limit)
            params.append('limit', options.limit.toString());
        const response = await fetch(`${this.baseUrl}/api/cli/memory/search?${params}`, {
            headers: this.getHeaders(),
        });
        if (!response.ok) {
            const error = new Error(await response.text());
            error.status = response.status;
            throw error;
        }
        return response.json();
    }
    /**
     * Export memory
     */
    async exportMemory(options) {
        await this.ensureInit();
        const params = new URLSearchParams();
        if (options.projectId)
            params.append('projectId', options.projectId);
        if (options.plaintext)
            params.append('plaintext', 'true');
        const response = await fetch(`${this.baseUrl}/api/cli/export?${params}`, {
            headers: this.getHeaders(),
        });
        if (!response.ok) {
            const error = new Error(await response.text());
            error.status = response.status;
            throw error;
        }
        return response.arrayBuffer();
    }
    /**
     * Import memory
     */
    async importMemory(data, options) {
        await this.ensureInit();
        const params = new URLSearchParams();
        if (options.merge)
            params.append('merge', 'true');
        if (options.replace)
            params.append('replace', 'true');
        const response = await fetch(`${this.baseUrl}/api/cli/import?${params}`, {
            method: 'POST',
            headers: {
                ...this.getHeaders(),
                'Content-Type': 'application/octet-stream',
            },
            body: data,
        });
        if (!response.ok) {
            const error = new Error(await response.text());
            error.status = response.status;
            throw error;
        }
        return response.json();
    }
    /**
     * Login and get token
     */
    async login(credentials) {
        await this.ensureInit();
        const response = await fetch(`${this.baseUrl}/api/cli/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials),
        });
        if (!response.ok) {
            const error = new Error(await response.text());
            error.status = response.status;
            throw error;
        }
        return response.json();
    }
    /**
     * Get server status
     */
    async status() {
        await this.ensureInit();
        const response = await fetch(`${this.baseUrl}/api/cli/status`, {
            headers: this.getHeaders(),
        });
        if (!response.ok) {
            const error = new Error(await response.text());
            error.status = response.status;
            throw error;
        }
        return response.json();
    }
}
exports.chorumApi = new ChorumApiClient();
//# sourceMappingURL=client.js.map