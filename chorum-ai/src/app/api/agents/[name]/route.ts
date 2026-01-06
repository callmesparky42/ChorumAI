import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

const AGENTS_DIR = path.join(process.cwd(), '.chorum', 'agents')

function toFilename(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '.md'
}

// DELETE - Remove a custom agent
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    const filename = toFilename(decodeURIComponent(name))
    const filepath = path.join(AGENTS_DIR, filename)

    // Check if file exists
    try {
      await fs.access(filepath)
    } catch {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    // Delete the file
    await fs.unlink(filepath)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete agent:', error)
    return NextResponse.json(
      { error: 'Failed to delete agent' },
      { status: 500 }
    )
  }
}
