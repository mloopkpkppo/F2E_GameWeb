import test from 'node:test';
import assert from 'node:assert/strict';
import { deployment, sitePath } from './site-config.js';
import { pageFor } from './navigation.js';
import { serveCloudflare } from './cloudflare-worker.mjs';

test('Pages subdirectory routes keep assets and sliders under the repository path', () => {
  deployment.basePath = '/F2E_GameWeb';
  deployment.apiOrigin = 'https://api.example.workers.dev';
  try {
    assert.equal(sitePath('/games?filter=saved'), '/F2E_GameWeb/games/?filter=saved');
    assert.equal(sitePath('/images/10.jpg'), '/F2E_GameWeb/images/10.jpg');
    assert.equal(sitePath('/account'), 'https://api.example.workers.dev/account');
    assert.equal(sitePath('https://store.steampowered.com/'), 'https://store.steampowered.com/');
    assert.equal(pageFor('/F2E_GameWeb/indie/').name, 'indie');
    assert.equal(pageFor('/other/indie/'), null);
  } finally {
    deployment.basePath = '';
    deployment.apiOrigin = '';
  }
});

test('only the configured Pages origin can read public API responses across origins', async () => {
  const env = { FRONTEND_ORIGIN: 'https://owner.github.io' };
  const app = { fetch: () => Response.json({ ok: true }) };
  const request = (path, origin) =>
    new Request('https://api.example/' + path, {
      headers: { Origin: origin },
    });
  const valid = await serveCloudflare(request('api/catalog', env.FRONTEND_ORIGIN), env, app);
  assert.equal(valid.headers.get('Access-Control-Allow-Origin'), env.FRONTEND_ORIGIN);
  assert.equal(valid.headers.get('Access-Control-Allow-Credentials'), null);
  assert.equal(
    (await serveCloudflare(request('api/me', env.FRONTEND_ORIGIN), env, app)).status,
    403,
  );
  assert.equal(
    (await serveCloudflare(request('api/catalog', 'https://evil.example'), env, app)).status,
    403,
  );
});

test('signed-in browsing keeps collection and authentication on the same Worker origin', async () => {
  const env = { FRONTEND_URL: 'https://owner.github.io/repo/' };
  const app = {
    fetch: () =>
      new Response('<a href="/games">Games</a><a href="/auth/steam">Login</a>', {
        headers: { 'Content-Type': 'text/html' },
      }),
  };
  const response = await serveCloudflare(new Request('https://api.example/account'), env, app);
  const html = await response.text();
  assert.ok(html.includes('href="/games"'));
  assert.ok(html.includes('href="/auth/steam"'));
});
