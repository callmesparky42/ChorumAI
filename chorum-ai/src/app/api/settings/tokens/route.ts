import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { generateToken, listTokens, revokeToken, renameToken } from '@/lib/mcp/auth'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const tokens = await listTokens(session.user.id)
    return NextResponse.json({ tokens })
  } catch (error) {
    console.error('[MCP] Failed to list tokens:', error)
    return NextResponse.json({ error: 'Failed to list tokens' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { name } = await request.json()
    const token = await generateToken(session.user.id, name || 'MCP Token')

    // Return the full token only once - user must save it
    return NextResponse.json({ token })
  } catch (error) {
    console.error('[MCP] Failed to generate token:', error)
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { tokenId, name } = await request.json()

    if (!tokenId || !name) {
      return NextResponse.json({ error: 'Token ID and name required' }, { status: 400 })
    }

    const success = await renameToken(tokenId, session.user.id, name)

    if (!success) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[MCP] Failed to rename token:', error)
    return NextResponse.json({ error: 'Failed to rename token' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { tokenId } = await request.json()

    if (!tokenId) {
      return NextResponse.json({ error: 'Token ID required' }, { status: 400 })
    }

    const success = await revokeToken(tokenId, session.user.id)

    if (!success) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[MCP] Failed to revoke token:', error)
    return NextResponse.json({ error: 'Failed to revoke token' }, { status: 500 })
  }
}

