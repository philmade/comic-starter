// comic-starter dev server — serves a comic folder AND accepts POST /save so the
// in-browser editor writes straight back to the working .html on disk.
// Usage:  node server.js [root-dir] [port]   (defaults: cwd, 8080)
//
// POST /save  body: {"file":"working.html","html":"<!DOCTYPE…"}  -> overwrites that
// .html file inside root (path-traversal guarded; only *.html may be written).
const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || process.cwd());
const PORT = parseInt(process.argv[3] || '8080', 10);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.gif': 'image/gif', '.woff2': 'font/woff2', '.mp4': 'video/mp4'
};

function safeJoin(urlPath) {                          // block path traversal outside ROOT
  const p = path.normalize(path.join(ROOT, decodeURIComponent(urlPath.split('?')[0])));
  return (p === ROOT || p.startsWith(ROOT + path.sep)) ? p : null;
}

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/save') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      try {
        const { file, html } = JSON.parse(body);
        const dest = safeJoin('/' + String(file || '').replace(/^\/+/, ''));
        if (!dest || !dest.endsWith('.html')) { res.writeHead(400); return res.end('bad file'); }
        fs.writeFileSync(dest, html, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, file, bytes: Buffer.byteLength(html) }));
        console.log('saved', path.relative(ROOT, dest), Buffer.byteLength(html), 'bytes');
      } catch (e) { res.writeHead(500); res.end(String(e)); }
    });
    return;
  }
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/working.html';
  const file = safeJoin(urlPath);
  if (!file) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`comic dev server: http://localhost:${PORT}/  (root: ${ROOT})`));
