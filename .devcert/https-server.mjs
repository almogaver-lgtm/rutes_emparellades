import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const [, , rootArg, pfxArg, passphrase, portArg] = process.argv;

if (!rootArg || !pfxArg || !passphrase) {
  console.error('Usage: node https-server.mjs <rootDir> <pfxPath> <passphrase> [port]');
  process.exit(1);
}

const rootDir = path.resolve(rootArg);
const pfxPath = path.resolve(pfxArg);
const port = Number(portArg || 8443);
const host = '0.0.0.0';

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

function getContentType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function resolvePathFromUrl(urlPathname) {
  const rawPath = decodeURIComponent(urlPathname.split('?')[0]);
  const normalizedPath = path.normalize(rawPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const safePath = normalizedPath.replace(/^([/\\])+/, '');
  let requestedPath = path.join(rootDir, safePath);

  if (rawPath === '/' || rawPath === '') {
    requestedPath = path.join(rootDir, 'index.html');
  }

  return requestedPath;
}

async function sendFile(response, filePath) {
  const stat = await fsp.stat(filePath);
  const finalPath = stat.isDirectory() ? path.join(filePath, 'index.html') : filePath;
  const finalStat = await fsp.stat(finalPath);

  response.writeHead(200, {
    'Content-Length': finalStat.size,
    'Content-Type': getContentType(finalPath),
    'Cache-Control': 'no-cache'
  });

  fs.createReadStream(finalPath).pipe(response);
}

const server = https.createServer(
  {
    pfx: fs.readFileSync(pfxPath),
    passphrase
  },
  async (request, response) => {
    try {
      const filePath = resolvePathFromUrl(request.url || '/');
      const relativePath = path.relative(rootDir, filePath);

      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      await sendFile(response, filePath);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }

      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Internal server error');
      console.error(error);
    }
  }
);

server.listen(port, host, () => {
  console.log(`HTTPS server running on https://localhost:${port}`);
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
