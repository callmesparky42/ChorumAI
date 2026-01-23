/**
 * LOGIN COMMAND
 */

import { H4x0rRenderer } from '../renderer/h4x0r';
import { updateConfig, getConfig } from '../config';
import { chorumApi } from '../api/client';
import * as http from 'http';
import open from 'open';

interface LoginOptions {
  url?: string;
}

export async function loginCommand(
  options: LoginOptions,
  renderer: H4x0rRenderer
): Promise<void> {
  const config = await getConfig();
  const apiUrl = options.url || config.apiUrl || 'http://localhost:3000';

  renderer.print('╔════════════════════════════════════════╗');
  renderer.print('║  CHORUM AUTHENTICATION                 ║');
  renderer.print('╚════════════════════════════════════════╝');
  console.log('');

  await renderer.typeText('Initializing secure connection...', 20);

  // Save API URL
  await updateConfig({ apiUrl });

  // Method selection
  console.log('');
  renderer.print('Select authentication method:');
  renderer.list(['[1] Browser OAuth (recommended)', '[2] API Token (manual)']);
  console.log('');

  const choice = await renderer.prompt('Choice [1]: ');

  if (choice === '2') {
    // Manual token entry
    const token = await renderer.promptPassword('Enter API token: ');

    if (!token) {
      renderer.error('No token provided');
      return;
    }

    await updateConfig({ apiToken: token });
    renderer.success('Token saved. Testing connection...');

    try {
      const status = await chorumApi.status();
      renderer.success(`Connected to Chorum v${status.version}`);
      renderer.dim(`Memory items: ${status.memoryCount}`);
      renderer.dim(`Providers: ${status.providersConfigured.join(', ')}`);
    } catch (err: any) {
      renderer.error(`Connection failed: ${err.message}`);
      renderer.dim('Token may be invalid. Run `chorum login` again.');
    }

  } else {
    // Browser OAuth flow
    await renderer.typeText('Opening browser for authentication...', 20);

    // Generate CSRF protection state token
    const { randomBytes } = await import('crypto');
    const stateToken = randomBytes(32).toString('hex');

    // Start local server to receive callback
    const port = 9876;
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost:${port}`);
      const token = url.searchParams.get('token');
      const expiresAt = url.searchParams.get('expiresAt');
      const receivedState = url.searchParams.get('state');

      // Validate CSRF state parameter
      if (receivedState !== stateToken) {
        res.writeHead(403, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="background: #0a0c10; color: #ff5050; font-family: monospace; padding: 40px; text-align: center;">
              <h1>✗ SECURITY ERROR</h1>
              <p>Invalid state parameter. Possible CSRF attack detected.</p>
            </body>
          </html>
        `);
        server.close();
        renderer.error('Authentication failed: Invalid state parameter');
        return;
      }

      if (token) {
        await updateConfig({
          apiToken: token,
          tokenExpiresAt: expiresAt || undefined
        });

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="background: #0a0c10; color: #00ff00; font-family: monospace; padding: 40px; text-align: center;">
              <h1>✓ AUTHENTICATION SUCCESSFUL</h1>
              <p>You can close this window and return to the terminal.</p>
            </body>
          </html>
        `);

        server.close();

        renderer.success('Authentication successful!');
        renderer.dim('Token saved to ~/.chorum/cli-config.json');

      } else {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="background: #0a0c10; color: #ff5050; font-family: monospace; padding: 40px; text-align: center;">
              <h1>✗ AUTHENTICATION FAILED</h1>
              <p>No token received. Please try again.</p>
            </body>
          </html>
        `);
      }
    });

    server.listen(port, () => {
      const authUrl = `${apiUrl}/api/cli/auth/oauth?callback=http://localhost:${port}&state=${stateToken}`;
      open(authUrl);
    });

    renderer.dim(`Waiting for browser authentication...`);
    renderer.dim(`(Press Ctrl+C to cancel)`);
  }
}
