import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { loadAssets } from './server.mjs';
const assets = await loadAssets();
const packed = Object.fromEntries(
  Object.entries(assets).map(([key, a]) => [
    key,
    { type: a.type, base64: Buffer.from(a.body).toString('base64') },
  ]),
);
const catalog = await readFile(new URL('./catalog.js', import.meta.url), 'utf8');
const auth = await readFile(new URL('./steam-auth.mjs', import.meta.url), 'utf8');
const api = (await readFile(new URL('./api.mjs', import.meta.url), 'utf8')).replace(
  /^import\s+\{\s*(?:catalog|handleSteamAuth)\s*\}\s+from\s+['"]\.\/(?:catalog\.js|steam-auth\.mjs)['"];?\s*$/gm,
  '',
);
const source = [
  catalog,
  auth,
  api,
  `
const packed = ${JSON.stringify(packed)};
const assets = Object.fromEntries(
  Object.entries(packed).map(([key, asset]) => [key, {
    type: asset.type,
    body: Uint8Array.from(atob(asset.base64), char => char.charCodeAt(0)),
  }]),
);
const handler = createHandler(assets);

export default {
  fetch(request, env) {
    return handler(request, {
      ...env,
      claimLogin: env.DB ? async (nonce, expires) => {
        await env.DB.prepare('DELETE FROM steam_login_nonces WHERE expires < ?')
          .bind(Date.now()).run();
        const result = await env.DB.prepare(
          'INSERT OR IGNORE INTO steam_login_nonces (nonce,expires) VALUES (?,?)',
        ).bind(nonce, expires).run();
        return result.meta.changes === 1;
      } : null,
    });
  },
};
`,
].join('\n');
await mkdir(new URL('../dist/server/', import.meta.url), { recursive: true });
await mkdir(new URL('../dist/.openai/', import.meta.url), { recursive: true });
await writeFile(new URL('../dist/server/index.js', import.meta.url), source);
await writeFile(
  new URL('../dist/.openai/hosting.json', import.meta.url),
  await readFile(new URL('../.openai/hosting.json', import.meta.url)),
);
console.log('Built dist/server/index.js');
await mkdir(new URL('../dist/.openai/drizzle/meta/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../dist/.openai/drizzle/0000_steam_login.sql', import.meta.url),
  await readFile(new URL('./migrations/0001_steam_login.sql', import.meta.url)),
);
await writeFile(
  new URL('../dist/.openai/drizzle/meta/_journal.json', import.meta.url),
  JSON.stringify({
    version: '7',
    dialect: 'sqlite',
    entries: [
      { idx: 0, version: '6', when: 1793440000000, tag: '0000_steam_login', breakpoints: true },
    ],
  }),
);
