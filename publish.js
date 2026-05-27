// publish.js — generate a deployable web build (index.html) from a comic's working.html.
// The auto-reflow lives in comic.web.css (+ comic.web.js for covered-content). This step just wires them
// into a published copy WITHOUT touching working.html (so it can't clobber an open editor).
// Usage:  node publish.js [comic-dir]        (default: cwd)
const fs = require('fs'), path = require('path');

const dir = path.resolve(process.argv[2] || process.cwd());
const srcFile = path.join(dir, 'working.html');
if (!fs.existsSync(srcFile)) { console.error('no working.html in ' + dir); process.exit(1); }
let html = fs.readFileSync(srcFile, 'utf8');

if (!/name=["']viewport["']/i.test(html))
  html = html.replace(/<head([^>]*)>/i, '<head$1>\n<meta name="viewport" content="width=device-width, initial-scale=1">');

// preserve Google Analytics (continuity with the existing storefront)
if (!/G-ME0L4DDMS2/.test(html))
  html = html.replace(/<\/head>/i,
    '<script async src="https://www.googletagmanager.com/gtag/js?id=G-ME0L4DDMS2"></script>\n' +
    '<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag(\'js\',new Date());gtag(\'config\',\'G-ME0L4DDMS2\');</script>\n</head>');

if (!/comic\.web\.css/i.test(html)) {
  if (/href=["']comic\.css["']/i.test(html))
    html = html.replace(/(<link[^>]*href=["']comic\.css["'][^>]*>)/i, '$1\n<link rel="stylesheet" href="comic.web.css">');
  else
    html = html.replace(/<\/head>/i, '<link rel="stylesheet" href="comic.web.css">\n</head>');
}

// inject the mid-comic CTA right after the EXHIBIT A / Plate XE325 reveal (the proven conversion spot)
if (!/class="webcta-mid"/i.test(html) && fs.existsSync(path.join(__dirname, 'web-cta-mid.html'))) {
  const mid = fs.readFileSync(path.join(__dirname, 'web-cta-mid.html'), 'utf8');
  const re = /<section\b(?:(?!<\/section>)[\s\S])*?the_real_discovery_image(?:(?!<\/section>)[\s\S])*?<\/section>/i;
  if (re.test(html)) html = html.replace(re, m => m + '\n' + mid);
}

// inject the end-of-comic conversion block (web-only), after the last page
if (!/class="webcta"/i.test(html) && fs.existsSync(path.join(__dirname, 'web-cta.html')))
  html = html.replace(/<\/body>/i, fs.readFileSync(path.join(__dirname, 'web-cta.html'), 'utf8') + '\n</body>');

if (!/comic\.web\.js/i.test(html))
  html = html.replace(/<\/body>/i, '<script src="comic.web.js"></script>\n</body>');

// copy the web assets in next to the build if they aren't already there
const here = __dirname;
['comic.web.css', 'comic.web.js'].forEach(f => {
  const dest = path.join(dir, f);
  if (fs.existsSync(path.join(here, f))) fs.copyFileSync(path.join(here, f), dest);
});

const outFile = path.join(dir, 'index.html');
fs.writeFileSync(outFile, html, 'utf8');
console.log('built ' + outFile);
console.log('deploy these to any static host:');
['index.html', 'comic.css', 'comic.web.css', 'comic.web.js', 'images/'].forEach(a => console.log('  ' + a));
