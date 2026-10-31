import http from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHandler} from './api.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function loadAssets() {
  const assets={};
  for(const dir of ['css','images','js']) for(const name of await readdir(path.join(root,dir))) {
    if(dir==='js' && !['app.js','catalog.js'].includes(name)) continue;
    const ext=path.extname(name);
    const type={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png'}[ext];
    if(type) assets['/'+dir+'/'+name]={body:await readFile(path.join(root,dir,name)),type};
  }
  assets['/index.html']={body:await readFile(path.join(root,'index.html')),type:'text/html; charset=utf-8'};
  return assets;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const server=http.createServer(async(req,res)=>{
    try {
      const handler=createHandler(await loadAssets());
      const response=await handler(new Request('http://localhost'+req.url,{method:req.method}));
      res.writeHead(response.status,Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {res.writeHead(500);res.end('Unable to serve page');}
  });
  server.listen(Number(process.env.PORT)||3000,'127.0.0.1',()=>console.log('PIXEL QUEST: http://localhost:'+(process.env.PORT||3000)));
}
