/**
 * CONFIG COMMAND
 * 
 * Manage CLI configuration (get, set, list)
 */

import { H4x0rRenderer } from '../renderer/h4x0r';
import { getConfig, setConfigValue, getConfigPath } from '../config';

export async function configCommand(
    action: string,
    key: string | undefined,
    value: string | undefined,
    renderer: H4x0rRenderer
): Promise<void> {
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
            renderer.print(getConfigPath());
            break;
        default:
            renderer.error(`Unknown action: ${action}`);
            renderer.dim('Available actions: list, get, set, path');
    }
}

async function listConfig(renderer: H4x0rRenderer): Promise<void> {
    const config = await getConfig();

    renderer.print('╔════════════════════════════════════════╗');
    renderer.print('║  CONFIGURATION                         ║');
    renderer.print('╠════════════════════════════════════════╣');

    const entries = Object.entries(config);
    if (entries.length === 0) {
        renderer.print('║  (No configuration set)                ║');
    } else {
        for (const [k, v] of entries) {
            // Mask sensitive values
            const displayValue = k === 'apiToken' ? '***' : String(v);
            const line = `  ${k}: ${displayValue}`;
            renderer.print(`║${line.padEnd(40)}║`);
        }
    }

    renderer.print('╚════════════════════════════════════════╝');
    renderer.dim(`Config file: ${getConfigPath()}`);
}

async function getConfigKey(key: string, renderer: H4x0rRenderer): Promise<void> {
    const config = await getConfig();
    const value = (config as any)[key];

    if (value === undefined) {
        renderer.warn(`Key not found: ${key}`);
    } else if (key === 'apiToken') {
        renderer.print('***');
    } else {
        renderer.print(String(value));
    }
}

async function setConfig(key: string, value: string, renderer: H4x0rRenderer): Promise<void> {
    // Validate key
    const allowedKeys = ['apiUrl', 'activeProject', 'crt', 'amber', 'typingSpeed'];

    if (!allowedKeys.includes(key)) {
        renderer.error(`Cannot set key: ${key}`);
        renderer.dim(`Allowed keys: ${allowedKeys.join(', ')}`);
        return;
    }

    // Parse value
    let parsedValue: any = value;
    if (value === 'true') parsedValue = true;
    if (value === 'false') parsedValue = false;
    if (/^\d+$/.test(value)) parsedValue = parseInt(value, 10);

    await setConfigValue(key as any, parsedValue);
    renderer.success(`Set ${key} = ${parsedValue}`);
}
