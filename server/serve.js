import dotenv from 'dotenv';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env') });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.WEB_PORT || '3457', 10);
const DIST_DIR = path.join(__dirname, 'dist');
const DATA_DIR = path.join(__dirname, 'data');
const SSL_KEY = path.join(__dirname, 'key.pem');
const SSL_CERT = path.join(__dirname, 'cert.pem');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveFile(res, filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const content = fs.readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
  });
  res.end(content);
  return true;
}

const sslOptions = {
  key: fs.readFileSync(SSL_KEY),
  cert: fs.readFileSync(SSL_CERT),
};

const server = https.createServer(sslOptions, (req, res) => {
  const url = new URL(req.url, `https://localhost:${PORT}`);
  let pathname = url.pathname;

  // Serve data files (user stats JSON)
  if (pathname.startsWith('/data/')) {
    const dataFile = path.join(DATA_DIR, pathname.replace('/data/', ''));
    if (serveFile(res, dataFile)) return;
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  // Serve reconciliation log (last 200 lines)
  if (pathname === '/reconcile-log') {
    const logFile = path.join(__dirname, 'reconcile.log');
    if (!fs.existsSync(logFile)) {
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end('No reconciliation log yet.');
      return;
    }
    const lines = fs.readFileSync(logFile, 'utf-8').split('\n');
    const tail = lines.slice(-200).join('\n');
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    res.end(tail);
    return;
  }

  // Serve static files from dist/
  if (pathname === '/') pathname = '/index.html';
  const distFile = path.join(DIST_DIR, pathname);
  if (serveFile(res, distFile)) return;

  // SPA fallback: serve index.html for all unmatched routes
  serveFile(res, path.join(DIST_DIR, 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎵 TrueRandom Web App`);
  console.log(`   https://0.0.0.0:${PORT}`);
  console.log(`   Serving SPA from: ${DIST_DIR}`);
  console.log(`   Serving data from: ${DATA_DIR}\n`);
});
