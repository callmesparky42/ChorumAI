import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

interface PatternRequest {
  patterns: string[]
  source: 'peer-review' | 'agent' | 'manual'
  focus?: string
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: PatternRequest = await req.json()
    const { patterns, source, focus } = body

    if (!patterns || patterns.length === 0) {
      return NextResponse.json({ error: 'No patterns provided' }, { status: 400 })
    }

    // Path to the patterns.md file in .chorum directory
    const patternsFile = path.join(process.cwd(), '.chorum', 'memory', 'patterns.md')

    // Ensure directory exists
    await fs.mkdir(path.dirname(patternsFile), { recursive: true })

    // Read existing content or create default structure
    let existingContent = ''
    try {
      existingContent = await fs.readFile(patternsFile, 'utf-8')
    } catch {
      // File doesn't exist, create with default structure
      existingContent = `# Learned Patterns

Patterns discovered during development that should be applied consistently.

---

## Code Patterns

## Security Patterns

## Architecture Patterns

## Review Insights

---

*Patterns are automatically added by peer reviews and agent learning.*
`
    }

    // Format new patterns
    const timestamp = new Date().toISOString().split('T')[0]
    const sourceLabel = source === 'peer-review' ? 'Peer Review' : source === 'agent' ? 'Agent Learning' : 'Manual'
    const focusLabel = focus ? ` (${focus})` : ''

    const newPatternSection = `
### ${sourceLabel}${focusLabel} - ${timestamp}

${patterns.map(p => `- ${p}`).join('\n')}
`

    // Find the appropriate section to insert based on focus
    let sectionHeader = '## Review Insights'
    if (focus === 'code') sectionHeader = '## Code Patterns'
    else if (focus === 'security') sectionHeader = '## Security Patterns'
    else if (focus === 'architecture') sectionHeader = '## Architecture Patterns'

    // Insert patterns after the appropriate section header
    const sectionIndex = existingContent.indexOf(sectionHeader)
    if (sectionIndex !== -1) {
      const insertPoint = existingContent.indexOf('\n', sectionIndex) + 1
      existingContent =
        existingContent.slice(0, insertPoint) +
        newPatternSection +
        existingContent.slice(insertPoint)
    } else {
      // Append to end if section not found
      existingContent += '\n' + newPatternSection
    }

    // Write updated content
    await fs.writeFile(patternsFile, existingContent, 'utf-8')

    return NextResponse.json({
      success: true,
      patternsAdded: patterns.length,
      file: '.chorum/memory/patterns.md'
    })

  } catch (error: any) {
    console.error('Pattern writeback error:', error)
    return NextResponse.json(
      { error: `Failed to save patterns: ${error.message}` },
      { status: 500 }
    )
  }
}

// GET endpoint to retrieve current patterns
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const patternsFile = path.join(process.cwd(), '.chorum', 'memory', 'patterns.md')

    try {
      const content = await fs.readFile(patternsFile, 'utf-8')
      return NextResponse.json({ content })
    } catch {
      return NextResponse.json({ content: null, message: 'No patterns file found' })
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: `Failed to read patterns: ${error.message}` },
      { status: 500 }
    )
  }
}
