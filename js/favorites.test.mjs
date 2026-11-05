import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFavoritesStore } from './favorites.mjs';
import { createHandler } from './api.mjs';
import { signToken } from './steam-auth.mjs';

const origin = 'https://favorites.test';
const secret = 'test-only-favorites-session-secret-long-enough';
const alice = '76561198000000001';
const bob = '76561198000000002';

test('verified accounts keep independent persistent collections across new sessions and database reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pixelized-favorites-'));
  let db = new DatabaseSync(join(directory, 'test.sqlite'));
  try {
    db.exec(
      await readFile(new URL('./migrations/0002_user_favorites.sql', import.meta.url), 'utf8'),
    );
    const env = {
      SITE_ORIGIN: origin,
      SESSION_SECRET: secret,
      favoritesStore: createFavoritesStore(db, true),
    };
    const handler = createHandler();
    async function request(steamid, method = 'GET', body, options = {}) {
      const token = steamid
        ? await signToken(
            {
              kind: 'session',
              origin,
              steamid,
              exp: Date.now() + 60000,
              browser: crypto.randomUUID(),
            },
            secret,
          )
        : '';
      return handler(
        new Request(origin + (options.path || '/api/me/favorites'), {
          method,
          headers: {
            Cookie: '__Host-pq_steam_session=' + token,
            'X-Favorites-Account': options.account || steamid || '',
            Origin: options.origin || origin,
            'Content-Type': options.contentType || 'application/json',
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
        env,
      );
    }
    assert.equal((await request(null)).status, 401);
    assert.equal(
      (await request(bob, 'PUT', { appid: 413150, saved: true }, { account: alice })).status,
      409,
    );
    assert.equal(
      (
        await request(
          alice,
          'PUT',
          { appid: 413150, saved: true },
          { origin: 'https://other.test' },
        )
      ).status,
      403,
    );
    assert.equal(
      (await request(alice, 'PUT', { appid: 413150, saved: true, steamid: bob })).status,
      400,
    );
    assert.equal((await request(alice, 'PUT', { appid: 999999999, saved: true })).status, 400);
    assert.equal((await request(alice, 'PUT', { appid: '413150', saved: true })).status, 400);
    assert.equal(
      (await request(alice, 'PUT', { appid: 413150, saved: true }, { contentType: 'text/plain' }))
        .status,
      400,
    );
    assert.equal((await request(alice, 'PATCH', {})).status, 405);
    assert.equal(
      (
        await request(
          alice,
          'POST',
          { ids: Array(3000).fill(413150) },
          { path: '/api/me/favorites/import' },
        )
      ).status,
      400,
    );
    assert.equal((await request(alice, 'PUT', { appid: 413150, saved: true })).status, 200);
    await request(alice, 'PUT', { appid: 413150, saved: true });
    await request(bob, 'PUT', { appid: 367520, saved: true });
    const read = await request(alice);
    assert.equal(read.headers.get('Cache-Control'), 'no-store, private');
    assert.deepEqual((await read.json()).ids, [413150]);
    assert.deepEqual((await (await request(bob)).json()).ids, [367520]);
    assert.equal(
      (
        await request(
          alice,
          'POST',
          { ids: [367520, 999999999] },
          { path: '/api/me/favorites/import' },
        )
      ).status,
      400,
    );
    assert.deepEqual((await (await request(alice)).json()).ids, [413150]);
    await request(
      alice,
      'POST',
      { ids: [367520, 413150, 367520] },
      { path: '/api/me/favorites/import' },
    );
    db.close();
    db = new DatabaseSync(join(directory, 'test.sqlite'));
    env.favoritesStore = createFavoritesStore(db, true);
    assert.deepEqual((await (await request(alice)).json()).ids, [367520, 413150]);
    await request(alice, 'PUT', { appid: 367520, saved: false });
    assert.deepEqual((await (await request(alice)).json()).ids, [413150]);
    assert.deepEqual((await (await request(bob)).json()).ids, [367520]);
    env.favoritesStore.list = () => {
      throw Error('database credentials must not leak');
    };
    const failure = await request(alice);
    assert.equal(failure.status, 503);
    assert.ok(!(await failure.text()).includes('credentials'));
  } finally {
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
