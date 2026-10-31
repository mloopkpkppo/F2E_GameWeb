import { mkdir, writeFile } from 'node:fs/promises';
import { catalog } from './catalog.js';
await mkdir(new URL('../images/', import.meta.url), { recursive: true });
for (const g of catalog) {
  const r = await fetch(
    `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${g.id}/header.jpg`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!r.ok || !r.headers.get('content-type')?.startsWith('image/'))
    throw new Error('無法下載封面：' + g.name);
  await writeFile(
    new URL(`../images/${g.id}.jpg`, import.meta.url),
    Buffer.from(await r.arrayBuffer()),
  );
  console.log('已儲存封面：' + g.name);
}
