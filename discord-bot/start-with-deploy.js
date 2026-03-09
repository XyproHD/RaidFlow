/**
 * Führt deploy-commands.js aus (Slash-Commands registrieren), danach startet der Bot.
 * Bei Fehlern bei der Command-Registrierung startet der Bot trotzdem.
 */
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'inherit', cwd: __dirname });
    child.on('close', (code) => resolve(code));
  });
}

const deployCode = await run('node', ['deploy-commands.js']);
if (deployCode !== 0) {
  console.warn('Command-Registrierung fehlgeschlagen oder übersprungen, starte Bot trotzdem.');
}

const bot = spawn('node', ['index.js'], { stdio: 'inherit', cwd: __dirname });
['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => bot.kill(sig)));
bot.on('close', (code) => process.exit(code ?? 0));