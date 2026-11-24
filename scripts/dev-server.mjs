#!/usr/bin/env node
/** Zero-dependency local static server: `node scripts/dev-server.mjs [port]`. */
import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = process.env.HOST ?? '127.0.0.1';
const URL_HOST = HOST.includes(':') && !HOST.startsWith('[') ? `[${HOST}]` : HOST;
const rawPort = Number(process.argv[2] ?? process.env.PORT ?? 4173);
const PORT = Number.isInteger(rawPort) && rawPort >= 1 && rawPort <= 65535 ? rawPort : 4173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
};

const realRoot = await realpath(ROOT);

createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, {
      'Content-Type': 'text/plain; charset=utf-8',
      Allow: 'GET, HEAD',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end('Method not allowed');
    return;
  }

  try {
    const rawUrl = req.url ?? '/';
    if (/%5c/i.test(rawUrl)) throw new Error('backslash not allowed');

    let pathname = decodeURIComponent(new URL(rawUrl, `http://${URL_HOST}`).pathname);
    if (pathname.includes('\0') || pathname.includes('\\')) throw new Error('invalid path');
    if (pathname.endsWith('/')) pathname += 'index.html';

    // Block hidden dot-files/directories (such as .git and .github) on both POSIX and Windows.
    const segments = pathname.split(/[/\\]/).filter(Boolean);
    if (segments.some((seg) => seg.startsWith('.'))) throw new Error('hidden path');

    const candidate = path.resolve(realRoot, `.${pathname}`);
    const relCandidate = path.relative(realRoot, candidate);
    if (!relCandidate || relCandidate.startsWith('..') || path.isAbsolute(relCandidate)) {
      throw new Error('outside root');
    }

    const realFile = await realpath(candidate);
    const relReal = path.relative(realRoot, realFile);
    if (!relReal || relReal.startsWith('..') || path.isAbsolute(relReal)) {
      throw new Error('symlink outside root');
    }

    const info = await stat(realFile);
    if (!info.isFile()) throw new Error('not a file');

    const ext = path.extname(realFile).toLowerCase();
    res.writeHead(200, {
      'Content-Type': TYPES[ext] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : await readFile(realFile));
  } catch {
    res.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : 'Not found');
  }
}).listen(PORT, HOST, () => console.log(`Sekaidle dev server: http://${URL_HOST}:${PORT}/`));
