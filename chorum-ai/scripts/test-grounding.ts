
import dotenv from 'dotenv'
import path from 'path'

// Load env before importing module that uses it (to satisfy DB init)
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function runTests() {
    const { verifyReference } = await import('../src/lib/learning/grounding')
    console.log('🧪 Running Memory Grounding Verification...')
    let passed = 0
    let failed = 0

    // Mock History Provider
    const mockHistory = async (pid: string, limit: number) => {
        return [
            { id: 'm1', content: 'I want to use Supabase for the database.', conversationId: 'conv_123' },
            { id: 'm2', content: 'Make sure we use Row Level Security.', conversationId: 'conv_123' },
            { id: 'm3', content: 'The project name is Chorum.', conversationId: 'conv_123' },
            { id: 'm4', content: 'My favorite color is blue.', conversationId: 'conv_123' }
        ]
    }

    // Test 1: Valid Learning (High overlap)
    console.log('\nTest 1: Valid Learning ("Supabase database")')
    const res1 = await verifyReference('Supabase database', 'proj_1', mockHistory)
    if (res1.verified && res1.source?.messageIds.includes('m1')) {
        console.log('✅ PASS')
        passed++
    } else {
        console.error('❌ FAIL', res1)
        failed++
    }

    // Test 2: Valid Learning (Keywords across messages?)
    // verifyReference logic requires ONE message to have >50% keywords.
    // "Row Level Security" -> "row", "level", "security". Message m2 has all 3.
    console.log('\nTest 2: Valid Learning ("Row Level Security")')
    const res2 = await verifyReference('Reference Row Level Security', 'proj_1', mockHistory)
    // keywords: reference, row, level, security
    // m2 has: row, level, security (3/4 = 75% > 50%) -> Should pass
    if (res2.verified) {
        console.log('✅ PASS')
        passed++
    } else {
        console.error('❌ FAIL', res2)
        failed++
    }

    // Test 3: Poison Pill (Hallucination)
    console.log('\nTest 3: Poison Pill ("The user hates React")')
    const res3 = await verifyReference('The user hates React', 'proj_1', mockHistory)
    if (!res3.verified) {
        console.log('✅ PASS', res3.reason)
        passed++
    } else {
        console.error('❌ FAIL: Should have rejected', res3)
        failed++
    }

    // Test 4: Partial/Weak Match
    // "Chorum is a cool project" -> chorum, cool, project
    // m3 has "chorum", "project" (2/3 = 66% > 50%) -> Should pass
    console.log('\nTest 4: Partial Match ("Chorum is a cool project")')
    const res4 = await verifyReference('Chorum is a cool project', 'proj_1', mockHistory)
    if (res4.verified) {
        console.log('✅ PASS')
        passed++
    } else {
        console.error('❌ FAIL', res4)
        failed++
    }

    console.log(`\nSummary: ${passed} Passed, ${failed} Failed`)
    if (failed > 0) process.exit(1)
}

runTests().catch(e => {
    console.error(e)
    process.exit(1)
})
