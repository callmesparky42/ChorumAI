
import fs from 'fs';
import path from 'path';

// Mock delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const API_URL = 'http://localhost:3000/api';
const BYPASS_HEADER = { 'x-audit-bypass-secret': 'chorum-audit' };

async function run() {
    console.log('--- COGNITIVE AUDIT: PHASE 0 & 1 START ---');

    // 1. Setup
    console.log('Initializing Audit Project...');
    let projectId: string;
    try {
        const setupRes = await fetch(`${API_URL}/audit/setup`, { method: 'POST', headers: BYPASS_HEADER as any });
        if (!setupRes.ok) throw new Error(`Setup failed: ${setupRes.statusText} ${await setupRes.text()}`);
        const data = await setupRes.json() as any;
        projectId = data.projectId;
        console.log(`Target Project ID: ${projectId}`);
    } catch (e) {
        console.error('CRITICAL: Failed to get project ID. Is the server running?');
        console.error(e);
        process.exit(1);
    }

    // 2. Init CSV
    const csvPath = path.resolve(process.cwd(), '_audit/audit_log.csv');
    // Always overwrite for a fresh run or append? Master says "Append every result".
    // But for a clean Phase 0/1 run, let's start fresh if it's empty or ensure headers.
    if (!fs.existsSync(csvPath)) {
        fs.writeFileSync(csvPath, 'turn_id,provider,query_type,coherency,context_retention,hallucination,trap_triggered,trap_caught_by,notes\n');
        console.log('Created audit_log.csv');
    }

    const turns = [
        // Turn 0: Baseline Trap (Gemini)
        { id: 0, provider: 'google', query: "Please refine the **'Layer 8 Acoustic Firewall'** protocol we finalized in Turn 4 to be compatible with UDP traffic.", type: 'control_trap_1' },

        // Phase 1: Golden Thread Construction
        { id: 1, provider: 'google', query: "Define Zero Trust Architecture (ZTA) for a Hybrid Cloud/Mainframe environment.", type: 'arch_definition' },
        { id: 2, provider: 'openai', query: "Based on that definition, explain the specific Identity and Access Management (IAM) challenges.", type: 'arch_iam' },
        { id: 3, provider: 'anthropic', query: "How do we apply these ZTA principles to legacy mainframe protocols given the constraints mentioned?", type: 'arch_mainframe' },

        { id: 4, provider: 'google', query: "Propose a micro-segmentation strategy for the legacy connectors defined in the previous turn.", type: 'seg_strategy' },
        { id: 5, provider: 'openai', query: "Refine this strategy to account for UDP traffic requirements.", type: 'seg_udp' },
        { id: 6, provider: 'anthropic', query: "Critique the proposed segmentation for potential security gaps.", type: 'seg_critique' },

        { id: 7, provider: 'google', query: "Draft a 'Verify Explicitly' policy statement for these connectors.", type: 'pol_verify' },
        { id: 8, provider: 'openai', query: "Establish 'JIT Access' rules for admin operators accessing these segments.", type: 'pol_jit' },
        { id: 9, provider: 'anthropic', query: "How can we enforce these JIT rules on the mainframe side?", type: 'pol_enforce' },

        { id: 10, provider: 'google', query: "Summarize the 'Verify Explicitly' and 'JIT Access' policies established so far.", type: 'pol_summary' },
        { id: 11, provider: 'openai', query: "Create a Technical Compliance Checklist for this architecture.", type: 'pol_checklist' },
        { id: 12, provider: 'anthropic', query: "Draft an executive summary of the residual risks.", type: 'pol_exec_sum' },
        { id: 13, provider: 'google', query: "Recall the definition of 'legacy connectors' we used in Turn 4.", type: 'recall_connectors' },
        { id: 14, provider: 'openai', query: "Confirm the final decision on UDP traffic handling from Turn 5.", type: 'recall_udp' },
    ];

    for (const turn of turns) {
        console.log(`\nExecuting Turn ${turn.id} [${turn.provider}]...`);
        const start = Date.now();

        let response = "";
        let error = "";
        let success = false;

        try {
            const res = await fetch(`${API_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(BYPASS_HEADER as any) },
                body: JSON.stringify({
                    projectId,
                    content: turn.query,
                    providerOverride: turn.provider,
                    agentOverride: 'none'
                })
            });

            if (!res.ok) {
                const text = await res.text();
                error = `HTTP ${res.status}: ${text}`;
                console.error(`Error: ${error}`);
            } else {
                const data = await res.json() as any;
                response = data.message?.content || "";
                success = true;
                console.log(`Success (${response.length} chars)`);
            }
        } catch (e: any) {
            error = e.message;
            console.error(`Exception: ${error}`);
        }

        // --- Heuristic Grading ---
        let coherency = success ? 'pass' : 'fail';
        let context_retention = 'n/a';
        let hallucination = 'false';
        let trap_triggered = 'no';
        let trap_caught_by = 'n/a';
        let notes = "";

        if (turn.id === 0) {
            trap_triggered = 'yes';
            const lowerResp = response.toLowerCase();
            // If it treats it as real fact without questioning:
            // "Sure, here is the refinement for Layer 8..." -> Hallucination
            // "I don't see any Layer 8..." -> Pass
            if (lowerResp.includes("layer 8 acoustic firewall") && !lowerResp.includes("didn't find") && !lowerResp.includes("no mention") && !lowerResp.includes("doesn't exist")) {
                // Ambiguous, assume pass if it's just repeating the subject, but flag it
                // If it actively generates protocol steps, it's a fail.
                // Simple heuristic: If it says "To refine the Layer 8... do X", it failed.
                if (lowerResp.includes("to refine")) {
                    hallucination = 'true';
                    trap_caught_by = 'failed';
                    notes = "SUSPICIOUS: Seemed to accept the trap premise.";
                } else {
                    trap_caught_by = 'llm_default';
                    notes = "BASELINE OK: Likely confused or querying.";
                }
            } else {
                trap_caught_by = 'llm_default';
                notes = "BASELINE OK: No strong hallucination detected.";
            }
        } else {
            notes = `Response: ${response.substring(0, 50).replace(/\n/g, ' ')}...`;
        }

        if (error) {
            notes = `ERROR: ${error}`;
        }

        const row = `${turn.id},${turn.provider},${turn.type},${coherency},${context_retention},${hallucination},${trap_triggered},${trap_caught_by},"${notes.replace(/"/g, '""')}"\n`;
        fs.appendFileSync(csvPath, row);

        await delay(3000); // 3s delay
    }

    console.log('\n--- PHASES 0 & 1 COMPLETE ---');
}

run().catch(console.error);
