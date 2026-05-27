// shot.js — screenshot a single working.html page via headless Chrome.
// Usage: node shot.js <comic-dir> <pageN> [outfile.png]
// Prints the output path. Lets the AI (or you) check a page after editing it,
// without a live browser session.
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');

const dir = path.resolve(process.argv[2] || '.');
const pageN = process.argv[3];
const out = path.resolve(process.argv[4] || path.join(os.tmpdir(), `comic-page-${pageN}.png`));
if (!pageN) { console.error('usage: node shot.js <comic-dir> <pageN> [out.png]'); process.exit(1); }

const html = fs.readFileSync(path.join(dir, 'working.html'), 'utf8');
const m = html.match(new RegExp(`<section[^>]*data-page="${pageN}"[\\s\\S]*?</section>`));
if (!m) { console.error(`page ${pageN} not found in working.html`); process.exit(1); }

// Minimal doc: just that page at its true size, no editor chrome, guides hidden.
const tmp = path.join(dir, '.shot.tmp.html');
fs.writeFileSync(tmp, `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="comic.css">
<style>html,body{margin:0;background:#fff}.page{box-shadow:none!important}.guides{display:none!important}</style>
</head><body>${m[0]}</body></html>`, 'utf8');

const chrome = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                '/Applications/Chromium.app/Contents/MacOS/Chromium',
                '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
                .find(p => fs.existsSync(p)) || 'google-chrome';
try {
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
    `--screenshot=${out}`, '--window-size=616,930', '--force-device-scale-factor=2',
    '--virtual-time-budget=2500', 'file://' + tmp
  ], { stdio: 'ignore' });
} finally { try { fs.unlinkSync(tmp); } catch (e) {} }
console.log(out);
