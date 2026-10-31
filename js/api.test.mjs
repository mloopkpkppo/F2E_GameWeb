import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, cached, normalizePrice } from './api.mjs';
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
