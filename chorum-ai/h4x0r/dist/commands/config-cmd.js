"use strict";
/**
 * CONFIG COMMAND
 *
 * Manage CLI configuration (get, set, list)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.configCommand = configCommand;
const config_1 = require("../config");
async function configCommand(action, key, value, renderer) {
    switch (action) {
        case 'list':
            await listConfig(renderer);
            break;
        case 'get':
            if (!key) {
                renderer.error('Usage: chorum config get <key>');
                return;
            }
            await getConfigKey(key, renderer);
            break;
        case 'set':
            if (!key || value === undefined) {
                renderer.error('Usage: chorum config set <key> <value>');
                return;
            }
            await setConfig(key, value, renderer);
            break;
        case 'path':
            renderer.print((0, config_1.getConfigPath)());
            break;
        default:
            renderer.error(`Unknown action: ${action}`);
            renderer.dim('Available actions: list, get, set, path');
    }
}
async function listConfig(renderer) {
    const config = await (0, config_1.getConfig)();
    renderer.print('╔════════════════════════════════════════╗');
    renderer.print('║  CONFIGURATION                         ║');
    renderer.print('╠════════════════════════════════════════╣');
    const entries = Object.entries(config);
    if (entries.length === 0) {
        renderer.print('║  (No configuration set)                ║');
    }
    else {
        for (const [k, v] of entries) {
            // Mask sensitive values
            const displayValue = k === 'apiToken' ? '***' : String(v);
            const line = `  ${k}: ${displayValue}`;
            renderer.print(`║${line.padEnd(40)}║`);
        }
    }
    renderer.print('╚════════════════════════════════════════╝');
    renderer.dim(`Config file: ${(0, config_1.getConfigPath)()}`);
}
async function getConfigKey(key, renderer) {
    const config = await (0, config_1.getConfig)();
    const value = config[key];
    if (value === undefined) {
        renderer.warn(`Key not found: ${key}`);
    }
    else if (key === 'apiToken') {
        renderer.print('***');
    }
    else {
        renderer.print(String(value));
    }
}
async function setConfig(key, value, renderer) {
    // Validate key
    const allowedKeys = ['apiUrl', 'activeProject', 'crt', 'amber', 'typingSpeed'];
    if (!allowedKeys.includes(key)) {
        renderer.error(`Cannot set key: ${key}`);
        renderer.dim(`Allowed keys: ${allowedKeys.join(', ')}`);
        return;
    }
    // Parse value
    let parsedValue = value;
    if (value === 'true')
        parsedValue = true;
    if (value === 'false')
        parsedValue = false;
    if (/^\d+$/.test(value))
        parsedValue = parseInt(value, 10);
    await (0, config_1.setConfigValue)(key, parsedValue);
    renderer.success(`Set ${key} = ${parsedValue}`);
}
//# sourceMappingURL=config-cmd.js.map