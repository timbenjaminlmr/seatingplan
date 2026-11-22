import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = process.argv.includes('--source') ? root : path.join(root, 'dist');
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT muss zwischen 1 und 65535 liegen.');
const types = new Map([
  ['index.html', 'text/html; charset=utf-8'],
  ['style.css', 'text/css; charset=utf-8'],
  ['app.js', 'text/javascript; charset=utf-8']
]);
const config = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'));
const responseHeaders = Object.fromEntries(config.headers[0].headers.map(({ key, value }) => [key, value]));

const server = createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
  }
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  const name = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!types.has(name)) { res.writeHead(404); res.end('Nicht gefunden.'); return; }
  try {
    const data = await readFile(path.join(directory, name));
    res.writeHead(200, { ...responseHeaders, 'Content-Type': types.get(name), 'Content-Length': data.length });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error(error.message);
    res.writeHead(404); res.end('Datei nicht gefunden. Für die Vorschau zuerst npm run build ausführen.');
  }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Sitzplan: http://127.0.0.1:${port} (${path.basename(directory)})`));
