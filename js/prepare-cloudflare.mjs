import { mkdir, writeFile } from 'node:fs/promises';
import { loadAssets } from './server.mjs';

// 只複製伺服器允許公開的檔案；不讀取 .env 或資料庫。
const output = new URL('../.local/cloudflare-public/', import.meta.url);
for (const [path, asset] of Object.entries(await loadAssets())) {
  const target = new URL(path.slice(1), output);
  await mkdir(new URL('.', target), { recursive: true });
  await writeFile(target, asset.body);
}
