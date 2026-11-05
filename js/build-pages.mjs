import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadAssets } from './server.mjs';
import { deployment, sitePath } from './site-config.js';

const apiOrigin = process.env.PUBLIC_API_ORIGIN;
if (
  !apiOrigin ||
  new URL(apiOrigin).protocol !== 'https:' ||
  new URL(apiOrigin).origin !== apiOrigin
) {
  throw Error('PUBLIC_API_ORIGIN 必須是 Cloudflare 後端的 HTTPS 網址，不含結尾斜線。');
}
deployment.basePath = process.env.PAGES_BASE_PATH || '/F2E_GameWeb';
if (!/^\/[A-Za-z0-9_-]+$/.test(deployment.basePath)) throw Error('無效的 Pages 路徑');
deployment.apiOrigin = apiOrigin;
const output = new URL('../dist/pages/', import.meta.url);
const assets = await loadAssets();
const hash = createHash('sha256');
for (const [path, asset] of Object.entries(assets).sort(([a], [b]) => a.localeCompare(b))) {
  if (/\.(js|css|html)$/.test(path)) hash.update(path).update(asset.body);
}
const version = hash.digest('hex').slice(0, 12);
for (const [path, asset] of Object.entries(assets)) {
  if (path === '/account.html') continue;
  let target = path.slice(1);
  let body = asset.body;
  if (path.endsWith('.html')) {
    body = body
      .toString()
      .replace(
        /\b(href|src|action)="(\/(?!\/)[^"]*)"/g,
        (_, attr, value) => `${attr}="${sitePath(value)}"`,
      );
    body = body.replace(
      /\b(href|src)="([^"]+\.(?:js|css))"/g,
      (_, attr, url) => `${attr}="${url}?v=${version}"`,
    );
    if (path !== '/index.html') target = path.slice(1, -5) + '/index.html';
  } else if (path === '/css/style.css') {
    body = body.toString().replaceAll("url('/images/", `url('${deployment.basePath}/images/`);
  } else if (path === '/js/site-config.js') {
    body = body.toString().replace("{ basePath: '', apiOrigin: '' }", JSON.stringify(deployment));
  }
  if (path.endsWith('.js')) {
    body = body
      .toString()
      .replace(/from '(\.\/[^']+\.js)'/g, (_, module) => `from '${module}?v=${version}'`);
  }
  const destination = new URL(target, output);
  await mkdir(new URL('.', destination), { recursive: true });
  await writeFile(destination, body);
}
await writeFile(new URL('.nojekyll', output), '');
console.log('Built GitHub Pages frontend (no secrets included).');
