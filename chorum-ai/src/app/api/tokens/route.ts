import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { generateToken, listTokens, revokeToken, renameToken } from '@/lib/mcp/auth'

/**
 * API Tokens Management
 * 
 * Allows users to manage their API tokens for mobile apps (MidnightMusings)
 * and IDE integrations (Claude Code, Cursor, etc.)
 * 
 * Note: This endpoint uses session auth only (not Bearer tokens) since
 * it's accessed from the web UI to manage tokens.
 */

// GET /api/tokens - List all active tokens for the user
export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const tokens = await listTokens(session.user.id)
        return NextResponse.json(tokens)
    } catch (error) {
        console.error('[API Tokens] Failed to list tokens:', error)
        return NextResponse.json({ error: 'Failed to list tokens' }, { status: 500 })
    }
}

// POST /api/tokens - Generate a new token
// Body: { name?: string }
export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await req.json().catch(() => ({}))
        const name = body.name || 'Mobile App'

        // Generate the token - user sees this ONCE, so we return it directly
        const token = await generateToken(session.user.id, name)

        return NextResponse.json({
            success: true,
            token, // Only returned once! User must save this
            message: 'Token created. Save this token - it will not be shown again.'
        })
    } catch (error) {
        console.error('[API Tokens] Failed to create token:', error)
        return NextResponse.json({ error: 'Failed to create token' }, { status: 500 })
    }
}

// DELETE /api/tokens?id=xxx - Revoke a token
export async function DELETE(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(req.url)
        const tokenId = searchParams.get('id')

        if (!tokenId) {
            return NextResponse.json({ error: 'Token ID required' }, { status: 400 })
        }

        const success = await revokeToken(tokenId, session.user.id)

        if (!success) {
            return NextResponse.json({ error: 'Token not found or already revoked' }, { status: 404 })
        }

        return NextResponse.json({ success: true, message: 'Token revoked' })
    } catch (error) {
        console.error('[API Tokens] Failed to revoke token:', error)
        return NextResponse.json({ error: 'Failed to revoke token' }, { status: 500 })
    }
}

// PATCH /api/tokens - Rename a token
// Body: { id: string, name: string }
export async function PATCH(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { id, name } = await req.json()

        if (!id || !name) {
            return NextResponse.json({ error: 'Token ID and name required' }, { status: 400 })
        }

        const success = await renameToken(id, session.user.id, name)

        if (!success) {
            return NextResponse.json({ error: 'Token not found' }, { status: 404 })
        }

        return NextResponse.json({ success: true, message: 'Token renamed' })
    } catch (error) {
        console.error('[API Tokens] Failed to rename token:', error)
        return NextResponse.json({ error: 'Failed to rename token' }, { status: 500 })
    }
}
