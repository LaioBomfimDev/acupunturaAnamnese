const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '../dist');
const localAtlasRoot = path.resolve(__dirname, '../.local-source-assets/atlas-ednea');
const atlasRoutePrefix = '/knowledge/source-assets/atlas-ednea/';
const port = Number(process.env.PORT || 3099);

const contentTypes = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function resolvePublicFile(urlPath) {
  const requestedPath = path.normalize(path.join(root, urlPath));
  if (
    requestedPath.startsWith(root) &&
    fs.existsSync(requestedPath) &&
    fs.statSync(requestedPath).isFile()
  ) {
    return requestedPath;
  }

  return null;
}

function resolveFile(urlPath) {
  const publicFile = resolvePublicFile(urlPath);
  if (publicFile) return publicFile;

  return path.join(root, 'index.html');
}

function resolveLocalAtlasFile(urlPath) {
  if (!urlPath.startsWith(atlasRoutePrefix)) return null;

  const relativePath = urlPath.slice(atlasRoutePrefix.length);
  const requestedPath = path.resolve(localAtlasRoot, relativePath);
  const relativeFromRoot = path.relative(localAtlasRoot, requestedPath);
  if (relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)) {
    return { forbidden: true };
  }

  if (fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
    return { filePath: requestedPath };
  }

  return null;
}

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const localAtlasFile = resolveLocalAtlasFile(urlPath);
  if (localAtlasFile?.forbidden) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  if (localAtlasFile?.filePath) {
    res.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': contentTypes[path.extname(localAtlasFile.filePath)] || 'application/octet-stream',
    });
    fs.createReadStream(localAtlasFile.filePath).pipe(res);
    return;
  }
  if (urlPath.startsWith(atlasRoutePrefix)) {
    const publicAtlasFile = resolvePublicFile(urlPath);
    if (publicAtlasFile) {
      res.writeHead(200, {
        'Content-Type': contentTypes[path.extname(publicAtlasFile)] || 'application/octet-stream',
      });
      fs.createReadStream(publicAtlasFile).pipe(res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const filePath = resolveFile(urlPath);

  res.writeHead(200, {
    'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
  });
  fs.createReadStream(filePath).pipe(res);
}).listen(port, '127.0.0.1', () => {
  console.log(`Preview em http://127.0.0.1:${port}`);
});
