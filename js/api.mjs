import {catalog} from './catalog.js';
import {handleSteamAuth} from './steam-auth.mjs';
const TTL = 10 * 60 * 1000;
const memory = new Map();
const pending = new Map();
const json = (body, status = 200) => Response.json(body, {status, headers:{'Cache-Control':'public, max-age=60','X-Content-Type-Options':'nosniff'}});
export async function cached(key, loader, now = Date.now()) {
  const old = memory.get(key);
  if (old && now - old.time < TTL) return {...old.value, stale:false};
  if (pending.has(key)) return pending.get(key);
  const job = (async () => {
    try { const value = await Promise.resolve().then(loader); memory.set(key,{time:now,value}); return {...value,stale:false}; }
    catch { if (old) return {...old.value,stale:true}; throw new Error('Steam 暫時無法連線，請稍後重試。'); }
    finally { pending.delete(key); }
  })();
  pending.set(key,job); return job;
}
async function steam(url) {
  const r = await fetch(url,{signal:AbortSignal.timeout(9000), headers:{Accept:'application/json'}});
  if (!r.ok) throw new Error('upstream');
  return r.json();
}
const safeImage = url => typeof url === 'string' && /^https:\/\/[a-z0-9.-]+\.steamstatic\.com\//i.test(url) ? url : null;
export function normalizePrice(d) {
  if (d.is_free) return {free:true,currency:'TWD',initial:0,final:0,discount:0};
  const p=d.price_overview;
  if (!p || !Number.isFinite(p.final) || !Number.isFinite(p.initial)) return null;
  return {free:false,currency:p.currency,initial:p.initial,final:p.final,discount:p.discount_percent || 0};
}
async function details(id) {
  return cached('detail:'+id,async()=>{
    const raw=await steam('https://store.steampowered.com/api/appdetails?appids='+id+'&cc=tw&l=tchinese');
    const d=raw[id]?.data;
    if(!raw[id]?.success || !d) throw new Error('not available');
    return {price:normalizePrice(d),release:d.release_date?.date || null,comingSoon:!!d.release_date?.coming_soon,developers:d.developers||[],screenshots:(d.screenshots||[]).slice(0,5).map(x=>safeImage(x.path_full)).filter(Boolean),steamDescription:d.short_description||'',updatedAt:new Date().toISOString()};
  });
}
async function reviews(id) {
  return cached('review:'+id,async()=>{
    const raw=await steam('https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/?appid='+id+'&language=all&num_per_page=5&filter=recent&purchase_type=steam&review_type=all');
    const d=raw.response || raw;
    if(!d.query_summary || !Array.isArray(d.reviews)) throw new Error('reviews unavailable');
    return {summary:d.query_summary,reviews:d.reviews.map(x=>({id:String(x.recommendationid),text:String(x.review||'').slice(0,4000),positive:!!x.voted_up,hours:Math.round((x.author?.playtime_at_review||0)/60),date:x.timestamp_created,steamid:/^\d+$/.test(x.author?.steamid)?x.author.steamid:null})),updatedAt:new Date().toISOString()};
  });
}
export function createHandler(assets = {}) {
  return async function handle(request, env = {}) {
    const url=new URL(request.url), path=url.pathname;
    const auth=await handleSteamAuth(request,env);
    if(auth)return auth;
    if(request.method!=='GET') return json({error:'不支援的操作'},405);
    if(path==='/api/catalog') {
      const games=[];
      // 僅更新精選名單，不逐筆掃描整個 Steam 商店。
      for(let i=0;i<catalog.length;i+=4) await Promise.all(catalog.slice(i,i+4).map(async g=>{
        try { games.push({...g,...await details(g.id),status:'ok'}); }
        catch { games.push({...g,price:null,status:'unavailable'}); }
      }));
      return json({games:catalog.map(g=>games.find(x=>x.id===g.id)),region:'TW',source:'Steam Store',checkedAt:new Date().toISOString()});
    }
    const m=path.match(/^\/api\/game\/(\d+)$/);
    if(m) {
      const id=Number(m[1]);
      if(!catalog.some(g=>g.id===id)) return json({error:'沒有收錄這款遊戲'},404);
      const [d,r,p]=await Promise.allSettled([details(id),reviews(id),cached('players:'+id,async()=>{
        const v=await steam('https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid='+id);
        if(v.response?.result!==1 || !Number.isFinite(v.response.player_count)) throw new Error('players unavailable');
        return {count:v.response.player_count,updatedAt:new Date().toISOString()};
      })]);
      return json({detail:d.status==='fulfilled'?d.value:null,reviewData:r.status==='fulfilled'?r.value:null,players:p.status==='fulfilled'?p.value:null});
    }
    if(path.startsWith('/api/')) return json({error:'找不到資料'},404);
    const asset=assets[path==='/'?'/index.html':path];
    if(!asset) return new Response('Not found',{status:404});
    return new Response(asset.body,{headers:{'Content-Type':asset.type,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; img-src 'self' https://*.steamstatic.com; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",'Cache-Control':path.includes('/images/')?'public, max-age=86400':'no-cache'}});
  };
}
