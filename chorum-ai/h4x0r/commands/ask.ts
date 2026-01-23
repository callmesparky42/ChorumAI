/**
 * ASK COMMAND
 * 
 * Send prompts to the chorus. Route through agents.
 */

import { H4x0rRenderer } from '../renderer/h4x0r';
import { getConfig } from '../config';
import { chorumApi } from '../api/client';

interface AskOptions {
  agent?: string;
  project?: string;
  model?: string;
  memory?: boolean;
}

export async function askCommand(
  prompt: string,
  options: AskOptions,
  renderer: H4x0rRenderer
): Promise<void> {
  if (!prompt || prompt.trim() === '') {
    renderer.error('No prompt provided');
    renderer.dim('Usage: chorum ask "your prompt here"');
    return;
  }

  const config = await getConfig();

  if (!config.apiToken) {
    renderer.error('Not authenticated. Run `chorum login` first.');
    return;
  }

  // Build request
  const request = {
    prompt: prompt.trim(),
    agent: options.agent,
    projectId: options.project || config.activeProject,
    forceModel: options.model,
    injectMemory: options.memory !== false,
  };

  // Show what we're doing
  if (options.agent) {
    renderer.dim(`[${options.agent.toUpperCase()}] Processing...`);
  } else {
    renderer.dim('[AUTO-ROUTE] Processing...');
  }

  try {
    // Start streaming response
    renderer.startStream();

    const response = await chorumApi.chat(request, {
      onChunk: (chunk: string) => {
        renderer.writeChunk(chunk);
      }
    });

    renderer.endStream();

    // Show metadata
    renderer.dim('');
    renderer.dim(`─────────────────────────────────────────`);
    renderer.dim(`Provider: ${response.provider} | Model: ${response.model}`);
    renderer.dim(`Tokens: ${response.tokensInput} in / ${response.tokensOutput} out`);
    renderer.dim(`Cost: $${response.costUsd?.toFixed(4) || '0.0000'}`);
    
    if (response.memoryInjected && response.memoryInjected > 0) {
      renderer.dim(`Memory: ${response.memoryInjected} items injected`);
    }
    
    if (response.wasFallback) {
      renderer.warn(`Fallback activated: ${response.failedProviders?.join(' → ')} → ${response.provider}`);
    }

  } catch (err: any) {
    renderer.endStream();
    
    if (err.code === 'ECONNREFUSED') {
      renderer.error('Cannot connect to Chorum server');
      renderer.dim(`Check that the server is running at ${config.apiUrl}`);
    } else if (err.status === 401) {
      renderer.error('Authentication failed. Run `chorum login` to re-authenticate.');
    } else if (err.status === 403) {
      renderer.error(`Security violation: ${err.message}`);
    } else {
      renderer.error(`Request failed: ${err.message}`);
    }
  }
}
