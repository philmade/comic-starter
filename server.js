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
  res.setHeader('Access-Control-Allow-Origin', '*');             // dev: allow the editor origin to POST /save
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }
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
  // POST /patch — replace (or delete) ONE page's <section> in place: a "diff" save, so
  // concurrent edits to *other* pages aren't clobbered. body: {file, page, html} | {file, page, op:'delete'}
  if (req.method === 'POST' && req.url === '/patch') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      try {
        const { file, page, html, op } = JSON.parse(body);
        const dest = safeJoin('/' + String(file || '').replace(/^\/+/, ''));
        if (!dest || !dest.endsWith('.html')) { res.writeHead(400); return res.end('bad file'); }
        let text = fs.readFileSync(dest, 'utf8');
        const re = new RegExp('<section[^>]*\\bdata-page="' + Number(page) + '"[\\s\\S]*?</section>');
        if (!re.test(text)) { res.writeHead(404); return res.end('page not found'); }
        text = op === 'delete' ? text.replace(re, '').replace(/\n{3,}/g, '\n\n') : text.replace(re, html);
        fs.writeFileSync(dest, text, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, page }));
        console.log('patched', path.relative(ROOT, dest), 'page', page, op || '');
      } catch (e) { res.writeHead(500); res.end(String(e)); }
    });
    return;
  }
  // POST /upload — save an uploaded image into images/ (base64 JSON). body: {name, dataB64} -> {ok, path}
  if (req.method === 'POST' && req.url === '/upload') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      try {
        const { name, dataB64 } = JSON.parse(body);
        const safe = String(name || '').replace(/[^A-Za-z0-9._-]/g, '_');
        if (!/\.(png|jpe?g|webp|gif)$/i.test(safe)) { res.writeHead(400); return res.end('not an image'); }
        const imgDir = path.join(ROOT, 'images');
        const dest = path.join(imgDir, safe);
        if (dest !== imgDir && !dest.startsWith(imgDir + path.sep)) { res.writeHead(403); return res.end('forbidden'); }
        fs.mkdirSync(imgDir, { recursive: true });
        fs.writeFileSync(dest, Buffer.from(dataB64, 'base64'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, path: 'images/' + safe }));
        console.log('uploaded', 'images/' + safe, fs.statSync(dest).size, 'bytes');
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
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`comic dev server: http://localhost:${PORT}/  (root: ${ROOT})`));
