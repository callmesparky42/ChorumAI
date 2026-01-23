"use strict";
/**
 * HACK COMMAND
 *
 * Easter egg. Because every H4X0R terminal needs one.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.hackCommand = hackCommand;
async function hackCommand(renderer) {
    console.log('');
    // Initial prompt
    await renderer.typeText('INITIALIZING H4X0R PROTOCOL...', 30);
    await sleep(500);
    // Matrix rain
    await renderer.typeText('Deploying visual countermeasures...', 20);
    await sleep(300);
    await renderer.matrixRain(2000);
    // Fake hacking sequence
    await renderer.fakeHack();
    await sleep(500);
    // The reveal
    console.log('');
    await renderer.glitchText('SOVEREIGN CONTEXT LAYER: ONLINE');
    console.log('');
    await renderer.typeText('Just kidding. This is a CLI for talking to AI.', 25);
    await renderer.typeText('But you looked cool for a second there.', 25);
    console.log('');
    renderer.dim('───────────────────────────────────────────────');
    renderer.dim('  "The only real hack is building something');
    renderer.dim('   that makes people\'s lives better."');
    renderer.dim('                            - Probably someone');
    renderer.dim('───────────────────────────────────────────────');
    console.log('');
    renderer.info('Now go build something. Run `chorum ask` to get started.');
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//# sourceMappingURL=hack.js.map