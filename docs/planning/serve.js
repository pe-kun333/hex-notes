// Tiny static server for the mock previews (mocks/preview/*.html).
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, 'mocks', 'preview');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.normalize(path.join(root, p)); if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => { if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found: ' + p); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data); });
}).listen(8787, () => console.log('mock preview server on http://localhost:8787'));
