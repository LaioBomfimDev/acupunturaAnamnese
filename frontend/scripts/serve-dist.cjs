const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '../dist');
const port = Number(process.env.PORT || 3099);

const contentTypes = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function resolveFile(urlPath) {
  const requestedPath = path.normalize(path.join(root, urlPath));
  if (
    requestedPath.startsWith(root) &&
    fs.existsSync(requestedPath) &&
    fs.statSync(requestedPath).isFile()
  ) {
    return requestedPath;
  }

  return path.join(root, 'index.html');
}

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const filePath = resolveFile(urlPath);

  res.writeHead(200, {
    'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
  });
  fs.createReadStream(filePath).pipe(res);
}).listen(port, '127.0.0.1', () => {
  console.log(`Preview em http://127.0.0.1:${port}`);
});
