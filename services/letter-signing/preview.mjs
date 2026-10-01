// Local-only static preview. API calls go to Wrangler's local Worker.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('../../site/letter', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2' };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost:8766');
    if (url.pathname.startsWith('/letter/api/')) {
      let length = 0;
      const chunks = [];
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 8192) { res.writeHead(413).end(); return; }
        chunks.push(chunk);
      }
      const headers = new Headers(req.headers);
      headers.delete('host'); headers.delete('content-length'); headers.delete('cf-connecting-ip');
      const response = await fetch(`http://127.0.0.1:8787${url.pathname}${url.search}`, {
        method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks), redirect: 'manual',
      });
      const outgoing = Object.fromEntries(response.headers);
      // fetch has already decoded any upstream compression.
      delete outgoing['content-encoding']; delete outgoing['content-length']; delete outgoing['transfer-encoding'];
      if (response.headers.getSetCookie().length) outgoing['set-cookie'] = response.headers.getSetCookie();
      res.writeHead(response.status, outgoing);
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method) || !url.pathname.startsWith('/letter/')) { res.writeHead(404).end(); return; }
    let path = resolve(root, '.' + decodeURIComponent(url.pathname.slice('/letter'.length)));
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(404).end(); return; }
    let info = await stat(path);
    if (info.isDirectory()) {
      if (!url.pathname.endsWith('/')) { res.writeHead(302, { Location: url.pathname + '/' }).end(); return; }
      path = resolve(path, 'index.html'); info = await stat(path);
    }
    path = await realpath(path);
    if (!path.startsWith(root + sep) || !types[extname(path)]) { res.writeHead(404).end(); return; }
    const headers = { 'Content-Type': types[extname(path)], 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes', 'Referrer-Policy': 'same-origin' };
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    if (start > end || start >= info.size) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end(); return; }
    headers['Content-Length'] = end - start + 1;
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
    res.writeHead(range ? 206 : 200, headers);
    if (req.method === 'HEAD') res.end(); else createReadStream(path, { start, end }).pipe(res);
  } catch {
    res.writeHead(503, { 'Content-Type': 'text/plain' }).end('Local preview unavailable. Start Wrangler and try again.');
  }
}).listen(8766, '127.0.0.1', () => console.log('Local preview at http://localhost:8766/letter/sign/'));
