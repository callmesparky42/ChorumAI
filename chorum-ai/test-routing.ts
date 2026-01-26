
import { selectAgent } from './src/lib/agents/orchestrator';
import { AgentDefinition } from './src/lib/agents/types';
import { loadBuiltInAgents } from './src/lib/agents/registry';

// Mock routing context
const mockContext = {
    userId: 'test-user',
    taskType: 'general' as const
};

async function testRouting() {
    console.log('Loading agents...');
    await loadBuiltInAgents(); // Preload

    const testCases = [
        { prompt: 'Analyze the data patterns in this file', expected: 'analyst' },
        { prompt: 'Design a scalable microservices architecture', expected: 'architect' },
        { prompt: 'Review this code for security vulnerabilities', expected: 'code-reviewer' },
        { prompt: 'Debug this crash in the payment gateway', expected: 'debugger' },
        { prompt: 'Research the latest React 19 features', expected: 'researcher' },
        { prompt: 'Write a blog post about AI agents', expected: 'writer' },
        { prompt: 'Edit this draft for better flow and tone', expected: 'editor' },
        { prompt: 'Create marketing copy for the landing page', expected: 'copywriter' },
        { prompt: 'Verify this claim about 99% uptime', expected: 'fact-checker' },
        { prompt: 'Create a project plan and roadmap', expected: 'planner' },
        { prompt: 'Translate this to Spanish', expected: 'translator' },
        { prompt: 'Explain how quantum computing works', expected: 'tutor' },
        { prompt: 'Summarize this long conversation', expected: 'summarizer' },
        { prompt: 'Coordinate the handoff between writer and editor', expected: 'coordinator' }
    ];

    console.log('\nRunning routing tests...\n');
    let passed = 0;

    for (const test of testCases) {
        const result = await selectAgent({
            prompt: test.prompt,
            userId: 'test-user'
        });

        const selectedId = result?.agent.id;
        const success = selectedId === test.expected;

        console.log(`[${success ? 'PASS' : 'FAIL'}] "${test.prompt}"`);
        console.log(`       Expected: ${test.expected} | Got: ${selectedId} (Conf: ${result?.confidence.toFixed(2)})`);

        if (!success) {
            console.log(`       Reasoning: ${result?.reasoning}`);
        }

        if (success) passed++;
    }

    console.log(`\nResult: ${passed}/${testCases.length} routed correctly.`);
}

testRouting().catch(console.error);
