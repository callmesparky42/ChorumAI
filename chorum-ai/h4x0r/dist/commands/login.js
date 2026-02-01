"use strict";
/**
 * LOGIN COMMAND
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginCommand = loginCommand;
const config_1 = require("../config");
const client_1 = require("../api/client");
const http = __importStar(require("http"));
const open_1 = __importDefault(require("open"));
async function loginCommand(options, renderer) {
    const config = await (0, config_1.getConfig)();
    const apiUrl = options.url || config.apiUrl || 'http://localhost:3000';
    renderer.print('╔════════════════════════════════════════╗');
    renderer.print('║  CHORUM AUTHENTICATION                 ║');
    renderer.print('╚════════════════════════════════════════╝');
    console.log('');
    await renderer.typeText('Initializing secure connection...', 20);
    // Save API URL
    await (0, config_1.updateConfig)({ apiUrl });
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
        await (0, config_1.updateConfig)({ apiToken: token });
        renderer.success('Token saved. Testing connection...');
        try {
            const status = await client_1.chorumApi.status();
            renderer.success(`Connected to Chorum v${status.version}`);
            renderer.dim(`Memory items: ${status.memoryCount}`);
            renderer.dim(`Providers: ${status.providersConfigured.join(', ')}`);
        }
        catch (err) {
            renderer.error(`Connection failed: ${err.message}`);
            renderer.dim('Token may be invalid. Run `chorum login` again.');
        }
    }
    else {
        // Browser OAuth flow
        await renderer.typeText('Opening browser for authentication...', 20);
        // Generate CSRF protection state token
        const { randomBytes } = await import('crypto');
        const stateToken = randomBytes(32).toString('hex');
        // Start local server to receive callback
        const port = 9876;
        const server = http.createServer(async (req, res) => {
            const url = new URL(req.url, `http://localhost:${port}`);
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
                await (0, config_1.updateConfig)({
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
            }
            else {
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
            (0, open_1.default)(authUrl);
        });
        renderer.dim(`Waiting for browser authentication...`);
        renderer.dim(`(Press Ctrl+C to cancel)`);
    }
}
//# sourceMappingURL=login.js.map