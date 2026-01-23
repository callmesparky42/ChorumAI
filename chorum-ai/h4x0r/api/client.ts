/**
 * CHORUM API CLIENT
 * 
 * Communicates with the Chorum web server.
 * Handles authentication, streaming, and error handling.
 */

import { getConfig } from '../config';

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

interface ApiError extends Error {
  status?: number;
  code?: string;
}

class ChorumApiClient {
  private baseUrl: string = '';
  private token: string = '';

  async init(): Promise<void> {
    const config = await getConfig();
    this.baseUrl = config.apiUrl || 'http://localhost:3000';
    this.token = config.apiToken || '';
  }

  private async ensureInit(): Promise<void> {
    if (!this.baseUrl) {
      await this.init();
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`,
    };
  }

  /**
   * Chat with streaming support
   */
  async chat(request: ChatRequest, callbacks: StreamCallbacks): Promise<ChatResponse> {
    await this.ensureInit();

    const response = await fetch(`${this.baseUrl}/api/cli/chat`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = new Error(await response.text()) as ApiError;
      error.status = response.status;
      throw error;
    }

    // Handle streaming response
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      return this.handleStream(response, callbacks);
    }

    // Handle non-streaming response
    const data = await response.json() as ChatResponse;
    callbacks.onChunk?.(data.content);
    callbacks.onComplete?.(data);
    return data;
  }

  /**
   * Handle SSE stream
   */
  private async handleStream(response: Response, callbacks: StreamCallbacks): Promise<ChatResponse> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let finalResponse: ChatResponse | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

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
              } else if (parsed.type === 'complete') {
                finalResponse = parsed;
                callbacks.onComplete?.(parsed);
              } else if (parsed.type === 'error') {
                throw new Error(parsed.message);
              }
            } catch (e) {
              // Not JSON, treat as raw chunk
              callbacks.onChunk?.(data);
            }
          }
        }
      }
    } finally {
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
  async review(request: {
    content: string;
    focus: string;
    friend?: string;
  }): Promise<any> {
    await this.ensureInit();

    const response = await fetch(`${this.baseUrl}/api/cli/review`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = new Error(await response.text()) as ApiError;
      error.status = response.status;
      throw error;
    }

    return response.json();
  }

  /**
   * List memory items
   */
  async listMemory(options: {
    projectId?: string;
    type?: string;
    limit?: number;
  }): Promise<MemoryItem[]> {
    await this.ensureInit();

    const params = new URLSearchParams();
    if (options.projectId) params.append('projectId', options.projectId);
    if (options.type) params.append('type', options.type);
    if (options.limit) params.append('limit', options.limit.toString());

    const response = await fetch(`${this.baseUrl}/api/cli/memory?${params}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = new Error(await response.text()) as ApiError;
      error.status = response.status;
      throw error;
    }

    return response.json() as Promise<MemoryItem[]>;
  }

  /**
   * Add memory item
   */
  async addMemory(item: {
    content: string;
    type: string;
    projectId?: string;
    domains?: string[];
  }): Promise<MemoryItem> {
    await this.ensureInit();

    const response = await fetch(`${this.baseUrl}/api/cli/memory`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(item),
    });

    if (!response.ok) {
      const error = new Error(await response.text()) as ApiError;
      error.status = response.status;
      throw error;
    }

    return response.json() as Promise<MemoryItem>;
  }

  /**
   * Delete memory item
   */
  async deleteMemory(id: string): Promise<void> {
    await this.ensureInit();

    const response = await fetch(`${this.baseUrl}/api/cli/memory/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = new Error(await response.text()) as ApiError;
      error.status = response.status;
      throw error;
    }
  }

  /**
   * Search memory
   */
  async searchMemory(query: string, options: {
    projectId?: string;
    limit?: number;
  }): Promise<MemoryItem[]> {
    await this.ensureInit();

    const params = new URLSearchParams({ query });
    if (options.projectId) params.append('projectId', options.projectId);
    if (options.limit) params.append('limit', options.limit.toString());

    const response = await fetch(`${this.baseUrl}/api/cli/memory/search?${params}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = new Error(await response.text()) as ApiError;
      error.status = response.status;
      throw error;
    }

    return response.json() as Promise<MemoryItem[]>;
  }

  /**
   * Export memory
   */
  async exportMemory(options: {
    projectId?: string;
    plaintext?: boolean;
  }): Promise<ArrayBuffer> {
    await this.ensureInit();

    const params = new URLSearchParams();
    if (options.projectId) params.append('projectId', options.projectId);
    if (options.plaintext) params.append('plaintext', 'true');

    const response = await fetch(`${this.baseUrl}/api/cli/export?${params}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = new Error(await response.text()) as ApiError;
      error.status = response.status;
      throw error;
    }

    return response.arrayBuffer();
  }

  /**
   * Import memory
   */
  async importMemory(data: ArrayBuffer, options: {
    merge?: boolean;
    replace?: boolean;
  }): Promise<{ added: number; skipped: number; conflicts: any[] }> {
    await this.ensureInit();

    const params = new URLSearchParams();
    if (options.merge) params.append('merge', 'true');
    if (options.replace) params.append('replace', 'true');

    const response = await fetch(`${this.baseUrl}/api/cli/import?${params}`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/octet-stream',
      },
      body: data,
    });

    if (!response.ok) {
      const error = new Error(await response.text()) as ApiError;
      error.status = response.status;
      throw error;
    }

    return response.json() as Promise<{ added: number; skipped: number; conflicts: unknown[] }>;
  }

  /**
   * Login and get token
   */
  async login(credentials: {
    email?: string;
    password?: string;
    oauthCode?: string;
  }): Promise<{ token: string; expiresAt: string }> {
    await this.ensureInit();

    const response = await fetch(`${this.baseUrl}/api/cli/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      const error = new Error(await response.text()) as ApiError;
      error.status = response.status;
      throw error;
    }

    return response.json() as Promise<{ token: string; expiresAt: string }>;
  }

  /**
   * Get server status
   */
  async status(): Promise<{
    version: string;
    memoryCount: number;
    providersConfigured: string[];
  }> {
    await this.ensureInit();

    const response = await fetch(`${this.baseUrl}/api/cli/status`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = new Error(await response.text()) as ApiError;
      error.status = response.status;
      throw error;
    }

    return response.json() as Promise<{ version: string; memoryCount: number; providersConfigured: string[] }>;
  }
}

export const chorumApi = new ChorumApiClient();
