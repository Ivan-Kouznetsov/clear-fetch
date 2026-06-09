import { createServer } from 'node:http';

export function startLocalServer(handler) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      Promise.resolve(handler(req, res)).catch((err) => {
        res.statusCode = 500;
        res.end(err.stack || err.message);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const url = `http://127.0.0.1:${port}`;
      resolve({
        url,
        close: () => new Promise((resolveClose) => server.close(resolveClose)),
      });
    });
  });
}

export function mockServerHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname === '/posts') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([{ id: 1, title: 'stub-title' }]));
    return;
  }
  
  if (pathname === '/posts/1') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 1, title: 'stub-title' }));
    return;
  }

  if (pathname === '/comments') {
    const postId = url.searchParams.get('postId');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([{ postId: Number(postId) || 1, id: 1, body: 'stub-comment' }]));
    return;
  }

  if (pathname === '/users') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([{ id: 1, name: 'stub-user' }]));
    return;
  }

  const statusMatch = pathname.match(/^\/status\/(\d+)$/);
  if (statusMatch) {
    const statusCode = parseInt(statusMatch[1], 10);
    res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
    res.end(`Status: ${statusCode}`);
    return;
  }

  const delayMatch = pathname.match(/^\/delay\/(\d+)$/);
  if (delayMatch) {
    const delaySeconds = parseInt(delayMatch[1], 10);
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok after delay');
    }, delaySeconds * 1000);
    return;
  }

  const bytesMatch = pathname.match(/^\/bytes\/(\d+)$/);
  if (bytesMatch) {
    const numBytes = parseInt(bytesMatch[1], 10);
    const buffer = Buffer.alloc(numBytes, 'a');
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    res.end(buffer);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

export function startMockServer() {
  return startLocalServer(mockServerHandler);
}
