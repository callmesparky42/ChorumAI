"use strict";
/**
 * ASK COMMAND
 *
 * Send prompts to the chorus. Route through agents.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.askCommand = askCommand;
const config_1 = require("../config");
const client_1 = require("../api/client");
async function askCommand(prompt, options, renderer) {
    if (!prompt || prompt.trim() === '') {
        renderer.error('No prompt provided');
        renderer.dim('Usage: chorum ask "your prompt here"');
        return;
    }
    const config = await (0, config_1.getConfig)();
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
    }
    else {
        renderer.dim('[AUTO-ROUTE] Processing...');
    }
    try {
        // Start streaming response
        renderer.startStream();
        const response = await client_1.chorumApi.chat(request, {
            onChunk: (chunk) => {
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
    }
    catch (err) {
        renderer.endStream();
        if (err.code === 'ECONNREFUSED') {
            renderer.error('Cannot connect to Chorum server');
            renderer.dim(`Check that the server is running at ${config.apiUrl}`);
        }
        else if (err.status === 401) {
            renderer.error('Authentication failed. Run `chorum login` to re-authenticate.');
        }
        else if (err.status === 403) {
            renderer.error(`Security violation: ${err.message}`);
        }
        else {
            renderer.error(`Request failed: ${err.message}`);
        }
    }
}
//# sourceMappingURL=ask.js.map