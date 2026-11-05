// GitHub Pages 建置時會替換這個設定；本機與原有網站維持同源。
export const deployment = { basePath: '', apiOrigin: '' };

export function sitePath(path) {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  const url = new URL(path, 'https://local.invalid');
  if (deployment.apiOrigin && url.pathname === '/account') return deployment.apiOrigin + path;
  const page = /^\/(games|indie|minigames|deals)\/?$/.exec(url.pathname);
  const pathname = deployment.basePath && page ? '/' + page[1] + '/' : url.pathname;
  return deployment.basePath + pathname + url.search + url.hash;
}

export const apiPath = (path) => deployment.apiOrigin + path;
