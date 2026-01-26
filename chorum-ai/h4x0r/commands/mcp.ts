import { spawn } from 'child_process'
import { H4x0rRenderer } from '../renderer/h4x0r'
import { getConfig } from '../config'
import path from 'path'

export interface McpOptions {
  port?: string
}

export async function mcpCommand(
  action: string,
  options: McpOptions,
  renderer: H4x0rRenderer
) {
  const config = await getConfig()

  if (!config.apiToken) {
    renderer.error('Not authenticated. Run `chorum login` first.')
    return
  }

  switch (action) {
    case 'serve':
      await startMcpServer(config.apiToken, renderer)
      break
    case 'status':
      renderer.info('MCP server status: checking...')
      renderer.dim('MCP server runs as a stdio process for IDE integration.')
      renderer.dim('It starts on-demand when your IDE connects.')
      break
    case 'config':
      showMcpConfig(config.apiToken, renderer)
      break
    default:
      renderer.error(`Unknown action: ${action}. Use: serve, status, config`)
      renderer.dim('  serve  - Start MCP server (stdio mode)')
      renderer.dim('  status - Check MCP server status')
      renderer.dim('  config - Show MCP configuration for IDE')
  }
}

async function startMcpServer(apiToken: string, renderer: H4x0rRenderer) {
  await renderer.typeText('Starting ChorumAI MCP Server...')
  renderer.info('Mode: stdio (for IDE integration)')
  renderer.dim('Token: ' + apiToken.slice(0, 12) + '...')
  renderer.dim('')
  renderer.dim('Waiting for MCP client connection...')
  renderer.dim('Press Ctrl+C to stop.')

  // Get the bin path relative to the h4x0r command
  const binPath = path.resolve(__dirname, '../../bin/chorum-mcp.js')

  const child = spawn('node', [binPath], {
    env: {
      ...process.env,
      CHORUM_API_TOKEN: apiToken
    },
    stdio: 'inherit'
  })

  child.on('error', (err) => {
    renderer.error(`Failed to start: ${err.message}`)
  })

  child.on('exit', (code) => {
    if (code !== 0) {
      renderer.error(`Server exited with code ${code}`)
    } else {
      renderer.success('MCP server stopped.')
    }
  })

  // Keep running until interrupted
  process.on('SIGINT', () => {
    child.kill('SIGINT')
    process.exit(0)
  })

  // Wait indefinitely
  await new Promise(() => {})
}

function showMcpConfig(apiToken: string, renderer: H4x0rRenderer) {
  renderer.print('')
  renderer.print('╔═══════════════════════════════════════════════════════════╗')
  renderer.print('║  MCP CONFIGURATION                                        ║')
  renderer.print('╚═══════════════════════════════════════════════════════════╝')
  renderer.print('')

  const config = {
    mcpServers: {
      chorum: {
        command: 'npx',
        args: ['chorum-mcp'],
        env: {
          CHORUM_API_TOKEN: apiToken
        }
      }
    }
  }

  renderer.dim('Add this to your IDE\'s MCP settings:')
  renderer.print('')
  console.log(JSON.stringify(config, null, 2))
  renderer.print('')

  renderer.info('Supported IDEs:')
  renderer.list([
    'Claude Code (claude_desktop_config.json)',
    'Cursor (settings.json → mcpServers)',
    'Windsurf (settings.json → mcpServers)',
    'VS Code + Continue (settings.json)'
  ])

  renderer.print('')
  renderer.warn('Keep your API token secure. Do not commit it to version control.')
}
