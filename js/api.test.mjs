import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, cached, normalizePrice } from './api.mjs';
import { loadAssets } from './server.mjs';
import { catalog } from './catalog.js';

test('catalog price requests use one bounded batch, retain unpriced games, and reject invalid offsets', async () => {
  const old = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    const u = new URL(url);
    const ids = u.searchParams.get('appids').split(',').map(Number);
    assert.ok(ids.length <= 24);
    assert.equal(u.searchParams.get('filters'), 'price_overview');
    return Response.json(
      Object.fromEntries(
        ids.map((id, index) => [
          id,
          {
            success: true,
            data:
              index === 0
                ? {
                    price_overview: {
                      currency: 'TWD',
                      initial: 10000,
                      final: 5000,
                      discount_percent: 50,
                    },
                  }
                : [],
          },
        ]),
      ),
    );
  };
  try {
    const handler = createHandler();
    assert.equal((await handler(new Request('https://test/api/catalog?offset=-1'))).status, 400);
    assert.equal(calls, 0);
    const first = await (await handler(new Request('https://test/api/catalog?offset=0'))).json();
    assert.equal(first.games.length, Math.min(24, catalog.length));
    assert.equal(first.total, catalog.length);
    assert.equal(first.nextOffset, catalog.length > 24 ? 24 : null);
    assert.equal(first.games[0].price.final, 5000);
    assert.equal(first.games[1].price, null);
    assert.equal(calls, 1);
    const lastOffset = Math.floor((catalog.length - 1) / 24) * 24;
    const last = await (
      await handler(new Request('https://test/api/catalog?offset=' + lastOffset))
    ).json();
    assert.equal(last.nextOffset, null);
    assert.deepEqual(
      last.games.map((g) => g.id),
      catalog.slice(lastOffset).map((g) => g.id),
    );
    const past = await (
      await handler(new Request('https://test/api/catalog?offset=' + catalog.length))
    ).json();
    assert.deepEqual(past.games, []);
    assert.equal(past.nextOffset, null);
  } finally {
    globalThis.fetch = old;
  }
});

test('separate pages support direct navigation, refresh, and HTML files without a catch-all fallback', async () => {
  const handler = createHandler(await loadAssets());
  for (const [route, page] of [
    ['/', 'home'],
    ['/games', 'games'],
    ['/indie', 'indie'],
    ['/minigames', 'minigames'],
    ['/deals', 'deals'],
    ['/account', 'account'],
  ]) {
    const response = await handler(new Request('https://test' + route));
    assert.equal(response.status, 200, route);
    const html = await response.text();
    assert.match(html, new RegExp('data-page="' + page + '"'));
    assert.equal((html.match(/<h1\b/g) || []).length, 1, route + ' has one page title');
    assert.doesNotMatch(html, /href="#(?:indie|deals|community|account)"/);
    assert.doesNotMatch(html, /href="\/community"/);
    if (page !== 'indie') assert.doesNotMatch(html, /id="indie"/);
    if (page !== 'deals') assert.doesNotMatch(html, /id="deals-grid"/);
  }
  assert.equal((await handler(new Request('https://test/indie.html'))).status, 200);
  const trailing = await handler(new Request('https://test/games/?filter=saved'));
  assert.equal(trailing.status, 308);
  assert.equal(trailing.headers.get('location'), '/games?filter=saved');
  assert.equal((await handler(new Request('https://test/no-such-page'))).status, 404);
  for (const route of ['/community', '/community/', '/community.html']) {
    const response = await handler(new Request('https://test' + route));
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), '/games');
  }
});
test('missing price is unknown, not free; prices remain integer minor units', () => {
  assert.equal(normalizePrice({}), null);
  assert.equal(normalizePrice({ is_free: true }).free, true);
  assert.deepEqual(
    normalizePrice({
      price_overview: { currency: 'TWD', initial: 39800, final: 19900, discount_percent: 50 },
    }),
    { free: false, currency: 'TWD', initial: 39800, final: 19900, discount: 50 },
  );
});
test('cache coalesces requests and returns last success on upstream outage', async () => {
  let calls = 0;
  const loader = async () => {
    calls++;
    return { count: 42 };
  };
  const values = await Promise.all([cached('test1', loader, 1000), cached('test1', loader, 1000)]);
  assert.equal(calls, 1);
  assert.equal(values[0].count, 42);
  const hit = await cached(
    'test1',
    () => {
      throw Error();
    },
    2000,
  );
  assert.equal(hit.stale, false);
  const stale = await cached(
    'test1',
    () => {
      throw Error();
    },
    700000,
  );
  assert.equal(stale.count, 42);
  assert.equal(stale.stale, true);
});
test('unlisted ids, malformed paths, writes and source files are blocked', async () => {
  const h = createHandler({ '/index.html': { body: '<!doctype html>', type: 'text/html' } });
  assert.equal((await h(new Request('http://test/api/game/999999'))).status, 404);
  assert.equal((await h(new Request('http://test/api/game/413150abc'))).status, 404);
  assert.equal((await h(new Request('http://test/api/catalog', { method: 'POST' }))).status, 405);
  assert.equal((await h(new Request('http://test/js/server.mjs'))).status, 404);
  assert.equal((await h(new Request('http://test/.openai/hosting.json'))).status, 404);
  const page = await h(new Request('http://test/'));
  assert.equal(page.status, 200);
  assert.match(page.headers.get('Content-Security-Policy'), /object-src 'none'/);
});
