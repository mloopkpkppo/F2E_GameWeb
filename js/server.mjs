import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHandler } from './api.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
export async function loadAssets() {
  const assets = {};
  for (const dir of ['css', 'images', 'js'])
    for (const name of await readdir(path.join(root, dir))) {
      if (
        dir === 'js' &&
        !['app.js', 'catalog.js', 'navigation.js', 'minigames.js', 'site-config.js'].includes(name)
      )
        continue;
      const ext = path.extname(name);
      const type = {
        '.css': 'text/css; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.jpg': 'image/jpeg',
        '.png': 'image/png',
      }[ext];
      if (type)
        assets['/' + dir + '/' + name] = { body: await readFile(path.join(root, dir, name)), type };
    }
  for (const name of (await readdir(root)).filter((name) => name.endsWith('.html'))) {
    assets['/' + name] = {
      body: await readFile(path.join(root, name)),
      type: 'text/html; charset=utf-8',
    };
  }
  return assets;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // 本機祕密只從未追蹤的 .env 或程序環境載入，不送到前端。
  try {
    process.loadEnvFile(path.join(root, '.env'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const { DatabaseSync } = await import('node:sqlite');
  await (await import('node:fs/promises')).mkdir(path.join(root, '.local'), { recursive: true });
  const db = new DatabaseSync(path.join(root, '.local/auth.sqlite'));
  db.exec(
    'CREATE TABLE IF NOT EXISTS steam_login_nonces (nonce TEXT PRIMARY KEY, expires INTEGER NOT NULL)',
  );
  const env = {
    SITE_ORIGIN: process.env.SITE_ORIGIN || 'http://localhost:' + (process.env.PORT || 3000),
    SESSION_SECRET: process.env.SESSION_SECRET || crypto.randomUUID() + crypto.randomUUID(),
    STEAM_API_KEY: process.env.STEAM_API_KEY,
    claimLogin: async (nonce, expires) => {
      db.prepare('DELETE FROM steam_login_nonces WHERE expires < ?').run(Date.now());
      return (
        db
          .prepare('INSERT OR IGNORE INTO steam_login_nonces (nonce,expires) VALUES (?,?)')
          .run(nonce, expires).changes === 1
      );
    },
  };
  const server = http.createServer(async (req, res) => {
    try {
      const handler = createHandler(await loadAssets());
      const response = await handler(
        new Request(env.SITE_ORIGIN + req.url, { method: req.method, headers: req.headers }),
        env,
      );
      const headers = Object.fromEntries(response.headers);
      if (response.headers.has('set-cookie'))
        headers['set-cookie'] = response.headers.getSetCookie();
      res.writeHead(response.status, headers);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500);
      res.end('Unable to serve page');
    }
  });
  server.listen(Number(process.env.PORT) || 3000, '127.0.0.1', () =>
    console.log('PIXELIZED: http://localhost:' + (process.env.PORT || 3000)),
  );
}
