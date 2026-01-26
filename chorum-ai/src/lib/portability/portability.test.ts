/**
 * Data Portability - Manual Test Script
 *
 * Run with: npx tsx src/lib/portability/portability.test.ts
 *
 * This script validates the export/import round-trip without requiring a database.
 */

import { validateExportPayload, ExportPayloadSchema } from './validator'
import { ExportPayload, EXPORT_VERSION } from './types'

// ============================================
// TEST DATA: Simple conversation history
// ============================================

const mockExportPayload: ExportPayload = {
    metadata: {
        exportVersion: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        source: 'chorum-web',
        chorumVersion: '0.1.0'
    },
    project: {
        id: 'test-project-uuid-1234',
        name: 'Test Project',
        description: 'A test project for data portability validation',
        techStack: ['TypeScript', 'Next.js', 'PostgreSQL'],
        customInstructions: 'Always use TypeScript strict mode.'
    },
    learning: {
        patterns: [
            {
                id: 'pattern-1',
                content: 'Use async/await instead of .then() chains',
                context: 'Code style preference',
                metadata: { source: 'user_feedback' },
                createdAt: '2026-01-15T10:00:00Z'
            }
        ],
        antipatterns: [
            {
                id: 'antipattern-1',
                content: 'Avoid using any type',
                context: 'TypeScript strictness',
                metadata: null,
                createdAt: '2026-01-15T11:00:00Z'
            }
        ],
        decisions: [
            {
                id: 'decision-1',
                content: 'Use Drizzle ORM for database access',
                context: 'Architecture decision',
                metadata: { decided_by: 'team' },
                createdAt: '2026-01-14T09:00:00Z'
            }
        ],
        invariants: [
            {
                id: 'invariant-1',
                content: 'Never expose API keys in client code',
                context: 'Security requirement',
                metadata: { severity: 'critical' },
                createdAt: '2026-01-10T08:00:00Z'
            }
        ],
        goldenPaths: [],
        links: [],
        cooccurrences: []
    },
    confidence: {
        score: '85.50',
        decayRate: '0.9900',
        interactionCount: 42,
        positiveInteractionCount: 38,
        lastDecayAt: '2026-01-20T00:00:00Z',
        updatedAt: '2026-01-21T12:00:00Z'
    },
    criticalFiles: [
        {
            filePath: 'src/lib/db/schema.ts',
            isCritical: true,
            linkedInvariants: ['invariant-1'],
            updatedAt: '2026-01-20T15:00:00Z'
        }
    ],
    memorySummaries: [
        {
            summary: 'User set up project, configured database, discussed architecture choices.',
            messageCount: 15,
            fromDate: '2026-01-14T00:00:00Z',
            toDate: '2026-01-15T23:59:59Z',
            createdAt: '2026-01-16T00:00:00Z'
        }
    ],
    customAgents: [
        {
            name: 'Security Auditor',
            config: {
                id: 'custom-security-auditor',
                name: 'Security Auditor',
                icon: '🔒',
                role: 'Security analysis specialist',
                tier: 'reasoning',
                isBuiltIn: false,
                isCustom: true,
                persona: {
                    description: 'Security-focused analyst',
                    tone: 'professional',
                    principles: ['Check for vulnerabilities', 'Be thorough']
                },
                model: {
                    temperature: 0.3,
                    maxTokens: 4000,
                    reasoningMode: true
                },
                memory: {
                    semanticFocus: 'Security vulnerabilities, OWASP, attack vectors',
                    requiredContext: ['project.md'],
                    optionalContext: [],
                    writesBack: ['patterns']
                },
                capabilities: {
                    tools: ['file_read', 'code_search'],
                    actions: ['Identify vulnerabilities', 'Suggest mitigations'],
                    boundaries: ['Does not implement fixes']
                },
                guardrails: {
                    hardLimits: ['Never ignore security issues'],
                    escalateTo: 'architect'
                }
            },
            createdAt: '2026-01-18T10:00:00Z'
        }
    ],
    conversations: [
        {
            title: 'Initial Setup',
            createdAt: '2026-01-14T09:00:00Z',
            updatedAt: '2026-01-14T10:30:00Z',
            messages: [
                {
                    role: 'user',
                    content: 'Help me set up the database schema',
                    provider: null,
                    costUsd: null,
                    images: null,
                    createdAt: '2026-01-14T09:00:00Z'
                },
                {
                    role: 'assistant',
                    content: 'I\'ll help you design a database schema. Let\'s start with the core entities...',
                    provider: 'anthropic',
                    costUsd: '0.002500',
                    images: null,
                    createdAt: '2026-01-14T09:01:00Z'
                }
            ]
        }
    ]
}

// ============================================
// TESTS
// ============================================

function runTests() {
    console.log('='.repeat(60))
    console.log('DATA PORTABILITY TEST SUITE')
    console.log('='.repeat(60))
    console.log()

    let passed = 0
    let failed = 0

    // Test 1: Valid payload passes validation
    console.log('TEST 1: Valid payload validation')
    const result1 = validateExportPayload(mockExportPayload)
    if (result1.valid && result1.data) {
        console.log('  ✓ PASS: Valid payload accepted')
        passed++
    } else {
        console.log('  ✗ FAIL:', result1.error)
        failed++
    }

    // Test 2: JSON serialization round-trip
    console.log('\nTEST 2: JSON serialization round-trip')
    const jsonString = JSON.stringify(mockExportPayload, null, 2)
    const parsed = JSON.parse(jsonString)
    const result2 = validateExportPayload(parsed)
    if (result2.valid) {
        console.log('  ✓ PASS: JSON round-trip preserves validity')
        passed++
    } else {
        console.log('  ✗ FAIL:', result2.error)
        failed++
    }

    // Test 3: Missing required field rejected
    console.log('\nTEST 3: Missing required field rejected')
    const invalidPayload = { ...mockExportPayload, metadata: undefined }
    const result3 = validateExportPayload(invalidPayload)
    if (!result3.valid) {
        console.log('  ✓ PASS: Missing metadata rejected')
        passed++
    } else {
        console.log('  ✗ FAIL: Should have rejected missing metadata')
        failed++
    }

    // Test 4: Invalid learning item type rejected
    console.log('\nTEST 4: Invalid nested field rejected')
    const badLearning = {
        ...mockExportPayload,
        learning: {
            ...mockExportPayload.learning,
            patterns: [{ content: 'missing id field' }] // Missing required 'id'
        }
    }
    const result4 = validateExportPayload(badLearning)
    if (!result4.valid) {
        console.log('  ✓ PASS: Invalid learning item rejected')
        passed++
    } else {
        console.log('  ✗ FAIL: Should have rejected invalid learning item')
        failed++
    }

    // Test 5: Export without conversations is valid
    console.log('\nTEST 5: Export without conversations is valid')
    const noConvos = { ...mockExportPayload, conversations: undefined }
    const result5 = validateExportPayload(noConvos)
    if (result5.valid) {
        console.log('  ✓ PASS: Conversations are optional')
        passed++
    } else {
        console.log('  ✗ FAIL:', result5.error)
        failed++
    }

    // Test 6: Empty arrays are valid
    console.log('\nTEST 6: Empty arrays are valid')
    const emptyArrays = {
        ...mockExportPayload,
        learning: {
            patterns: [],
            antipatterns: [],
            decisions: [],
            invariants: [],
            goldenPaths: [],
            links: [],
            cooccurrences: []
        },
        criticalFiles: [],
        memorySummaries: [],
        customAgents: []
    }
    const result6 = validateExportPayload(emptyArrays)
    if (result6.valid) {
        console.log('  ✓ PASS: Empty arrays accepted')
        passed++
    } else {
        console.log('  ✗ FAIL:', result6.error)
        failed++
    }

    // Test 7: Export size check
    console.log('\nTEST 7: Export size measurement')
    const exportSize = Buffer.byteLength(jsonString, 'utf8')
    console.log(`  ℹ Export size: ${exportSize} bytes (${(exportSize / 1024).toFixed(2)} KB)`)
    if (exportSize > 0) {
        console.log('  ✓ PASS: Export produces valid JSON')
        passed++
    } else {
        console.log('  ✗ FAIL: Export is empty')
        failed++
    }

    // Test 8: Data sovereignty check - no sensitive fields
    console.log('\nTEST 8: Data sovereignty - no sensitive fields exported')
    const sensitiveFields = ['apiKey', 'password', 'token', 'secret', 'credential']
    const jsonLower = jsonString.toLowerCase()
    const foundSensitive = sensitiveFields.filter(f => jsonLower.includes(f))
    if (foundSensitive.length === 0) {
        console.log('  ✓ PASS: No sensitive field names in export')
        passed++
    } else {
        console.log('  ✗ FAIL: Found sensitive fields:', foundSensitive)
        failed++
    }

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log(`RESULTS: ${passed} passed, ${failed} failed`)
    console.log('='.repeat(60))

    // Output sample export for manual inspection
    console.log('\n--- SAMPLE EXPORT (first 2000 chars) ---')
    console.log(jsonString.substring(0, 2000) + '...')

    return failed === 0
}

// Run if executed directly
runTests()
