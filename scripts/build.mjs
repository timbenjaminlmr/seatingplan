import { copyFile, lstat, mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
// Nur ausdrücklich genannte App-Dateien werden öffentlich ausgeliefert.
const publicFiles = ['index.html', 'style.css', 'app.js'];

// Erst alle Quellen prüfen, dann die bisherige Ausgabe ersetzen.
for (const name of publicFiles) {
  const source = path.join(root, name);
  const info = await lstat(source);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Keine reguläre App-Datei: ${name}`);
  if (!info.size) throw new Error(`Leere App-Datei: ${name}`);
}
const html = await readFile(path.join(root, 'index.html'), 'utf8');
if (!html.includes('href="style.css"') || !html.includes('src="app.js"')) {
  throw new Error('index.html muss die vorhandenen Dateien style.css und app.js einbinden.');
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of publicFiles) await copyFile(path.join(root, name), path.join(output, name));
console.log(`Build fertig: ${publicFiles.join(', ')} → dist/`);
