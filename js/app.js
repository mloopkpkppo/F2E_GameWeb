import { catalog } from './catalog.js';
const $ = (s) => document.querySelector(s);
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const validId = (id) => catalog.some((g) => g.id === Number(id));
function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    toast('瀏覽器無法保存資料，請確認儲存空間或隱私設定。');
    return false;
  }
}
const stored = readStorage('pq-saved', []);
let saved = new Set(Array.isArray(stored) ? stored.filter(validId).map(Number) : []);
let games = catalog.map((g) => ({ ...g, price: null })),
  type = 'all',
  query = '',
  genre = 'all',
  sort = 'featured',
  activeId = null,
  previousFocus = null,
  detailToken = 0;
const details = new Map();
let ownedGames = null,
  libraryLimit = 25,
  currentUser = null;
let toastTimer;
function toast(text) {
  $('#toast').textContent = text;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('#toast').hidden = true), 3200);
}
function money(value, currency = 'TWD') {
  try {
    return new Intl.NumberFormat('zh-TW', {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'TWD' ? 0 : 2,
    }).format(value / 100);
  } catch {
    return (value / 100).toFixed(2) + ' ' + currency;
  }
}
function priceHTML(p) {
  if (!p) return '<span class="price-unavailable">價格暫未取得</span>';
  return /* HTML */ `<span class="price"
    >${p.discount ? /* HTML */ `<span class="discount">-${esc(p.discount)}%</span><del>${esc(money(p.initial, p.currency))}</del>` : ''}<strong
      >${p.free ? '免費遊玩' : esc(money(p.final, p.currency))}</strong
    ></span
  >`;
}
function saveButton(g) {
  return /* HTML */ `<button
    class="save-button ${saved.has(g.id) ? 'saved' : ''}"
    data-save="${g.id}"
    aria-pressed="${saved.has(g.id)}"
    aria-label="${saved.has(g.id) ? '取消收藏' : '收藏'} ${esc(g.name)}"
  >
    ${saved.has(g.id) ? '♥' : '♡'}
  </button>`;
}
function card(g) {
  return /* HTML */ `<article class="game-card">
    <div class="card-image">
      <img
        src="/images/${g.id}.jpg"
        alt="${esc(g.name)} 遊戲封面"
        width="460"
        height="215"
        loading="lazy"
      />
      <div class="card-labels">
        <span class="label ${g.indie ? 'purple' : ''}"
          >${g.solo ? '個人開發' : g.indie ? '獨立遊戲' : 'STEAM'}</span
        >${ownedGames?.some((x) => x.id === g.id) ? '<span class="label owned-label">已擁有</span>' : ''}
      </div>
    </div>
    ${saveButton(g)}
    <div class="card-content">
      <h3>${esc(g.name)}</h3>
      <p class="card-subtitle">${esc(g.zh)}</p>
      <div class="card-tags">
        <span>${esc(g.genre)}</span>${g.indie ? '<span>Indie</span>' : ''}
      </div>
      <div class="card-bottom"><span class="steam-mark">STEAM ↗</span>${priceHTML(g.price)}</div>
    </div>
    <button
      class="card-open"
      data-open="${g.id}"
      aria-label="查看 ${esc(g.name)} 遊戲介紹"
    ></button>
  </article>`;
}
function render() {
  let list = games.filter(
    (g) =>
      (type !== 'indie' || g.indie) &&
      (type !== 'solo' || g.solo) &&
      (type !== 'saved' || saved.has(g.id)) &&
      (genre === 'all' || g.genre === genre) &&
      [g.name, g.zh, g.developer].some((x) => x.toLowerCase().includes(query)),
  );
  if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'discount')
    list.sort((a, b) => (b.price?.discount ?? -1) - (a.price?.discount ?? -1));
  if (sort === 'price')
    list.sort((a, b) => (a.price?.final ?? Infinity) - (b.price?.final ?? Infinity));
  $('#game-grid').innerHTML = list.map(card).join('');
  $('#empty').hidden = list.length > 0;
  $('#result-count').textContent = `顯示 ${list.length} 款 / 共收錄 ${games.length} 款遊戲`;
  $('#saved-count').textContent = saved.size;
  $('#saved-nav').setAttribute('aria-pressed', String(type === 'saved'));
  document.querySelectorAll('[data-type]').forEach((b) => {
    b.classList.toggle('selected', b.dataset.type === type);
    b.setAttribute('aria-pressed', String(b.dataset.type === type));
  });
}
function renderDeals() {
  const list = games
    .filter((g) => g.price?.discount > 0 && !g.stale)
    .sort((a, b) => b.price.discount - a.price.discount)
    .slice(0, 6);
  $('#deals-grid').innerHTML = list.length
    ? list
        .map(
          (g) =>
            /* HTML */ `<article class="deal-card">
              <div class="deal-image">
                <img
                  src="/images/${g.id}.jpg"
                  alt="${esc(g.name)} 遊戲封面"
                  width="460"
                  height="215"
                  loading="lazy"
                /><span class="discount">-${g.price.discount}%</span>
              </div>
              <div class="deal-content">
                <div>
                  <h3>${esc(g.name)}</h3>
                  <p>${esc(g.genre)} · Steam 台灣區</p>
                </div>
                <span class="price"
                  ><del>${esc(money(g.price.initial, g.price.currency))}</del
                  ><strong>${esc(money(g.price.final, g.price.currency))}</strong></span
                >
              </div>
              <button
                class="card-open"
                data-open="${g.id}"
                aria-label="查看 ${esc(g.name)} 特價資訊"
              ></button>
            </article>`,
        )
        .join('')
    : '<div class="empty"><h3>目前沒有可確認的特價</h3><p>可能是收錄作品目前沒有折扣，或 Steam 資料暫時無法取得。稍後可再更新。</p></div>';
}
async function loadCatalog() {
  $('#refresh').disabled = true;
  $('#data-status').textContent = '正在取得 Steam 台灣區價格…';
  try {
    const r = await fetch('/api/catalog');
    if (!r.ok) throw new Error();
    const data = await r.json();
    if (!Array.isArray(data.games)) throw new Error();
    games = data.games.filter((g) => validId(g.id));
    const available = games.filter((g) => g.status === 'ok').length;
    const dates = games.filter((g) => g.updatedAt).map((g) => new Date(g.updatedAt).getTime());
    const time = dates.length
      ? new Date(Math.min(...dates)).toLocaleString('zh-TW', {
          timeZone: 'Asia/Taipei',
          hour12: false,
        })
      : '尚無';
    $('#data-status').textContent =
      `來源：Steam 台灣商店 · ${available}/${games.length} 款已更新 · 最早資料時間：${time}（台北）${games.some((g) => g.stale) ? ' · 部分為上次成功資料' : ''} · 快取 10 分鐘`;
    render();
    renderDeals();
  } catch {
    $('#data-status').textContent =
      'Steam 目前無法連線。仍可瀏覽精選介紹，價格未取得的作品不列入優惠。';
    renderDeals();
  } finally {
    $('#refresh').disabled = false;
  }
}
function setType(value) {
  type = value;
  render();
}
function toggleSave(id) {
  const next = new Set(saved);
  next.has(id) ? next.delete(id) : next.add(id);
  if (!writeStorage('pq-saved', [...next])) return;
  saved = next;
  render();
  updateDialogSave();
  toast(saved.has(id) ? '已加入收藏，保存在此瀏覽器。' : '已從收藏移除。');
}
function updateDialogSave() {
  const b = $('#dialog-save');
  if (b) {
    b.textContent = saved.has(activeId) ? '♥ 已收藏' : '♡ 加入收藏';
    b.setAttribute('aria-pressed', String(saved.has(activeId)));
  }
}
const date = (t) => new Date(t * 1000).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
function reviewHTML(r, g, preview = false) {
  const sourceLink = preview
    ? /* HTML */ `<button class="text-link" data-open="${g.id}">${esc(g.name)} ↗</button>`
    : r.steamid
      ? /* HTML */ `<a
          class="text-link"
          href="https://steamcommunity.com/profiles/${r.steamid}/recommended/${g.id}/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Steam 原文 ↗
        </a>`
      : '';
  return /* HTML */ `<article class="review-card">
    <div class="review-heading">
      <span class="${r.positive ? 'review-positive' : 'review-negative'}"
        >${r.positive ? '＋ 推薦' : '－ 不推薦'}</span
      ><span class="muted">Steam · ${esc(date(r.date))}</span>
    </div>
    <p class="review-excerpt">${esc(r.text)}</p>
    <div class="review-bottom"><span>評價時遊玩 ${esc(r.hours)} 小時</span>${sourceLink}</div>
  </article>`;
}
async function getDetail(id) {
  if (details.has(id)) return details.get(id);
  const r = await fetch('/api/game/' + id);
  if (!r.ok) throw new Error();
  const d = await r.json();
  details.set(id, d);
  return d;
}
async function loadCommunity() {
  const picks = [413150, 2379780, 367520];
  const results = await Promise.allSettled(
    picks.map(async (id) => {
      const d = await getDetail(id);
      const g = games.find((g) => g.id === id);
      return d.reviewData?.reviews[0] ? reviewHTML(d.reviewData.reviews[0], g, true) : '';
    }),
  );
  const html = results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value)
    .join('');
  $('#community-grid').innerHTML =
    html ||
    '<div class="empty"><h3>評論暫時無法取得</h3><p>可以點開遊戲查看介紹，或直接前往 Steam 閱讀玩家評論。</p><button class="button outline" id="retry-community">重新取得評論</button></div>';
}
const dialog = $('#game-dialog');
function openGame(id) {
  const g = games.find((g) => g.id === id);
  if (!g) return;
  if (!dialog.open) {
    previousFocus = document.activeElement;
    dialog.showModal();
    document.body.classList.add('modal-open');
  }
  activeId = id;
  const token = ++detailToken;
  $('#dialog-content').innerHTML = /* HTML */ `<img
      class="dialog-hero"
      src="/images/${id}.jpg"
      alt="${esc(g.name)} 遊戲封面"
    />
    <div class="dialog-body">
      <div class="dialog-top">
        <div>
          <span class="eyebrow lime"
            >${g.solo ? '個人開發' : g.indie ? '獨立遊戲' : 'Steam 遊戲'}</span
          >
          <h2 id="dialog-title">${esc(g.name)}</h2>
          <p>${esc(g.zh)} · ${esc(g.genre)} · ${esc(g.developer)}</p>
        </div>
        <div id="dialog-price">${priceHTML(g.price)}</div>
      </div>
      <p class="dialog-description">${esc(g.description)}</p>
      <div class="dialog-actions">
        <a
          class="button primary"
          href="https://store.steampowered.com/app/${id}/?cc=tw&l=tchinese"
          target="_blank"
          rel="noopener noreferrer"
          >Steam 商店 ↗</a
        ><button class="button outline" id="dialog-save" aria-pressed="false">♡ 加入收藏</button
        ><a
          class="text-link"
          href="https://steamdb.info/app/${id}/"
          target="_blank"
          rel="noopener noreferrer"
          >查看 SteamDB ↗</a
        >
      </div>
      <div id="detail-live" role="status">
        <p class="muted">正在讀取發售資訊、在線人數與評價…</p>
      </div>
      <div id="screenshots" class="screenshots"></div>
      <h3>Steam 玩家評價</h3>
      <p class="fine-print">所有語言 · Steam 購買評論 · 原文顯示；本站沒有修改評論內容。</p>
      <div id="steam-reviews" class="review-list"><p class="muted">載入中…</p></div>
      <h3>你的遊戲筆記 / 試用留言</h3>
      <p class="form-note">只儲存在此瀏覽器。其他訪客看不到，也不會同步到 Steam。</p>
      <div id="local-comments"></div>
      <form id="comment-form" class="comment-form">
        <div class="form-row">
          <label
            >玩家暱稱<input
              name="nickname"
              required
              maxlength="24"
              autocomplete="nickname"
              placeholder="怎麼稱呼你？" /></label
          ><label
            >你的評價<select name="rating">
              <option value="recommend">推薦這款遊戲</option>
              <option value="neutral">有優點，也有缺點</option>
              <option value="negative">不太適合我</option>
            </select></label
          >
        </div>
        <label
          >遊玩心得<textarea
            name="comment"
            rows="4"
            required
            minlength="3"
            maxlength="1000"
            placeholder="分享玩法、喜歡的地方，或給新玩家的小建議…"
          ></textarea></label
        ><button type="submit" class="button primary">儲存試用留言 ＋</button>
      </form>
    </div>`;
  dialog.scrollTop = 0;
  updateDialogSave();
  renderComments();
  getDetail(id)
    .then((d) => {
      if (activeId !== id || token !== detailToken) return;
      const s = d.reviewData?.summary;
      const positive =
        s && s.total_positive + s.total_negative > 0
          ? Math.round((s.total_positive / (s.total_positive + s.total_negative)) * 100)
          : null;
      const stale = d.detail?.stale || d.reviewData?.stale || d.players?.stale;
      $('#detail-live').innerHTML = /* HTML */ `<div class="detail-metrics">
          <div><span>發售日期</span><b>${esc(d.detail?.release || '暫無資料')}</b></div>
          <div>
            <span>Steam 目前遊玩人數${d.players?.stale ? '（上次資料）' : ''}</span
            ><b>${d.players ? Number(d.players.count).toLocaleString() : '暫無資料'}</b>
          </div>
          <div>
            <span>所選範圍的正面評論比例</span
            ><b
              >${positive === null ? '暫無資料' : positive + '%'}
              ${s ? /* HTML */ `<small>／${Number(s.total_reviews).toLocaleString()} 則</small>` : ''}</b
            >
          </div>
        </div>
        <p class="fine-print">
          ${stale ? '部分為上次成功取得的資料。 ' : ''}價格、人數與評論最多快取 10 分鐘；以 Steam
          頁面為準。介紹為本站編輯摘要。
        </p>`;
      $('#dialog-price').innerHTML = priceHTML(d.detail?.price || g.price);
      $('#screenshots').innerHTML = (d.detail?.screenshots || [])
        .map(
          (src, i) =>
            /* HTML */ `<img
              src="${esc(src)}"
              alt="${esc(g.name)} 遊戲截圖 ${i + 1}"
              loading="lazy"
            />`,
        )
        .join('');
      $('#steam-reviews').innerHTML = d.reviewData?.reviews.length
        ? d.reviewData.reviews.map((r) => reviewHTML(r, g)).join('')
        : /* HTML */ `<p class="muted">
            暫無可顯示的評論，請前往
            <a
              class="text-link"
              href="https://store.steampowered.com/app/${id}/#app_reviews_hash"
              target="_blank"
              rel="noopener noreferrer"
              >Steam 查看 ↗</a
            >
          </p>`;
    })
    .catch(() => {
      if (activeId !== id || token !== detailToken) return;
      $('#detail-live').textContent = 'Steam 資料暫時無法取得，仍可閱讀介紹或前往商店。';
      $('#steam-reviews').textContent = '評論暫時無法取得。';
    });
}
function comments() {
  const c = readStorage('pq-comments', []);
  return Array.isArray(c)
    ? c
        .filter(
          (x) =>
            x &&
            typeof x.id === 'string' &&
            validId(x.game) &&
            typeof x.text === 'string' &&
            typeof x.name === 'string' &&
            Number.isFinite(x.date),
        )
        .slice(0, 100)
    : [];
}
function renderComments() {
  if (!$('#local-comments')) return;
  const list = comments().filter((c) => c.game === activeId);
  $('#local-comments').innerHTML = list.length
    ? list
        .map(
          (c) =>
            /* HTML */ `<article class="local-comment">
              <button
                class="subtle-button"
                data-delete="${esc(c.id)}"
                aria-label="刪除這則試用留言"
              >
                刪除</button
              ><b>${esc(c.name)}</b
              ><small>
                ·
                ${{ recommend: '推薦', neutral: '優缺點並存', negative: '不太適合我' }[c.rating] || '心得'}
                · ${esc(new Date(c.date).toLocaleDateString('zh-TW'))}</small
              >
              <p>${esc(c.text)}</p>
            </article>`,
        )
        .join('')
    : '<p class="muted">還沒有筆記，來記下你的第一個心得吧。</p>';
}
document.addEventListener('click', (e) => {
  const save = e.target.closest('[data-save]');
  if (save) {
    toggleSave(Number(save.dataset.save));
    return;
  }
  const open = e.target.closest('[data-open]');
  if (open) {
    openGame(Number(open.dataset.open));
    return;
  }
  const chip = e.target.closest('[data-type]');
  if (chip) {
    setType(chip.dataset.type);
    return;
  }
  if (e.target.closest('#dialog-save')) toggleSave(activeId);
  const del = e.target.closest('[data-delete]');
  if (del) {
    if (
      writeStorage(
        'pq-comments',
        comments().filter((c) => c.id !== del.dataset.delete),
      )
    )
      renderComments();
  }
  if (e.target.closest('#retry-community')) loadCommunity();
  if (e.target.closest('#load-library')) loadLibrary();
  if (e.target.closest('#more-library')) {
    libraryLimit += 25;
    renderLibrary();
  }
  if (e.target.closest('#retry-account')) loadAccount();
});
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'comment-form') return;
  e.preventDefault();
  const form = e.target,
    fd = new FormData(form),
    name = String(fd.get('nickname')).trim(),
    text = String(fd.get('comment')).trim(),
    rating = String(fd.get('rating'));
  if (!name || name.length > 24 || text.length < 3 || text.length > 1000) {
    toast('請填寫暱稱，以及 3～1000 字的心得。');
    return;
  }
  const next = [
    { id: crypto.randomUUID(), game: activeId, name, text, rating, date: Date.now() },
    ...comments(),
  ].slice(0, 100);
  if (writeStorage('pq-comments', next)) {
    form.reset();
    renderComments();
    toast('心得已保存在此瀏覽器。');
  }
});
$('#search').addEventListener('input', (e) => {
  query = e.target.value.trim().toLowerCase();
  render();
});
$('#genre').innerHTML += [...new Set(catalog.map((g) => g.genre))]
  .map((g) => /* HTML */ `<option>${esc(g)}</option>`)
  .join('');
$('#genre').addEventListener('change', (e) => {
  genre = e.target.value;
  render();
});
$('#sort').addEventListener('change', (e) => {
  sort = e.target.value;
  render();
});
$('#reset-filters').addEventListener('click', () => {
  query = '';
  genre = 'all';
  sort = 'featured';
  $('#search').value = '';
  $('#genre').value = 'all';
  $('#sort').value = 'featured';
  setType('all');
});
$('#refresh').addEventListener('click', loadCatalog);
$('#all-indie').addEventListener('click', () => {
  setType('indie');
  $('#explore').scrollIntoView();
});
$('#saved-nav').addEventListener('click', () => {
  setType(type === 'saved' ? 'all' : 'saved');
  $('#explore').scrollIntoView();
});
$('#close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) {
    const b = dialog.getBoundingClientRect();
    if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom)
      dialog.close();
  }
});
dialog.addEventListener('close', () => {
  activeId = null;
  detailToken++;
  document.body.classList.remove('modal-open');
  const id = previousFocus?.dataset?.open;
  const replacement = id ? document.querySelector(`[data-open="${id}"]`) : null;
  if (previousFocus?.isConnected) previousFocus.focus();
  else replacement?.focus();
});
document.addEventListener('keydown', (e) => {
  if (
    e.key === '/' &&
    !dialog.open &&
    !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
  ) {
    e.preventDefault();
    $('#search').focus();
    $('#explore').scrollIntoView();
  }
});
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries)
      if (entry.isIntersecting)
        document
          .querySelectorAll('.nav-link')
          .forEach((a) => a.classList.toggle('active', a.hash === '#' + entry.target.id));
  },
  { rootMargin: '-15% 0px -65% 0px' },
);
['explore', 'indie', 'deals', 'community'].forEach((id) =>
  observer.observe(document.getElementById(id)),
);
async function loadAccount() {
  const box = $('#account-content');
  try {
    const c = await fetch('/auth/steam/config', { cache: 'no-store' });
    if (!c.ok) throw Error();
    const config = await c.json();
    if (!config.loginReady) {
      box.innerHTML = /* HTML */ `
        <div class="account-card">
          <div class="avatar-placeholder pixel" aria-hidden="true">＋</div>
          <div>
            <h3>Steam 登入準備中</h3>
            <p>這個版本已預留登入與個人資料介面，網站管理者需要先完成後端登入設定。</p>
            <p class="fine-print">你仍可直接使用遊戲探索、收藏及試用留言。</p>
          </div>
        </div>
      `;
      return;
    }
    const r = await fetch('/api/me', { cache: 'no-store' });
    if (!r.ok) throw Error();
    const d = await r.json();
    if (!d.authenticated) {
      box.innerHTML = /* HTML */ `<div class="account-card">
        <div class="avatar-placeholder pixel" aria-hidden="true">P1</div>
        <div>
          <h3>使用 Steam 帳號登入</h3>
          <p>
            登入後可查看
            SteamID。${config.profileReady ? '還能讀取暱稱、頭像，以及公開的遊戲庫。' : '暱稱、頭像與遊戲庫將在網站管理者設定 API Key 後開放。'}
          </p>
          <a class="button primary steam-login" href="/auth/steam" target="_top"
            >使用 Steam 登入 ↗</a
          >
          <p class="fine-print">前往 Steam 官方網站驗證，本站不會要求你的 Steam 密碼。</p>
        </div>
      </div>`;
    } else {
      currentUser = d.user;
      $('#steam-nav').textContent = d.user.name ? '我的 Steam' : 'Steam 已登入';
      const status =
        {
          key_required:
            'Steam 身分已驗證。管理者尚未設定 API Key，暱稱、頭像與遊戲庫暫時無法讀取。',
          unavailable: 'Steam 身分已驗證，但個人資料暫時無法讀取，請稍後再試。',
          ok: '已連接 Steam。可選擇讀取公開的遊戲庫，查看已擁有的作品。',
        }[d.profileStatus] || '已連接 Steam。';
      const avatar = d.user.avatar
        ? /* HTML */ `<img
            class="player-avatar"
            src="${esc(d.user.avatar)}"
            alt="Steam 玩家頭像"
            width="88"
            height="88"
          />`
        : '<div class="avatar-placeholder pixel" aria-hidden="true">P1</div>';
      box.innerHTML = /* HTML */ `<div class="account-card">
          ${avatar}
          <div class="player-info">
            <p class="eyebrow lime">Steam 已登入</p>
            <h3>${esc(d.user.name || 'Steam 玩家')}</h3>
            <p class="steam-id">SteamID：${esc(d.user.steamid)}</p>
            <p>${esc(status)}</p>
            <div class="account-actions">
              <a
                class="text-link"
                href="${esc(d.user.profileUrl)}"
                target="_blank"
                rel="noopener noreferrer"
                >Steam 個人檔案 ↗</a
              >
              <form action="/auth/steam/logout" method="post" target="_top">
                <button class="button outline" type="submit">登出 Steam</button>
              </form>
            </div>
          </div>
        </div>
        <div class="library-panel">
          <div class="library-heading">
            <div>
              <h3>我的 Steam 遊戲庫</h3>
              <p>由你決定何時讀取。只取得 Steam 允許公開的遊戲及累積時數。</p>
            </div>
            <button
              id="load-library"
              class="button outline"
              ${!config.profileReady ? 'disabled' : ''}
            >
              讀取我的遊戲庫 ↻
            </button>
          </div>
          <div id="library-result" role="status">
            <p class="muted">
              ${config.profileReady ? '尚未讀取遊戲庫。' : '等待管理者設定 Steam Web API Key。'}
            </p>
          </div>
        </div>`;
    }
    const outcome = new URL(location.href).searchParams.get('steam_login');
    if (outcome) {
      $('#account-notice').textContent =
        {
          success: 'Steam 登入成功。',
          cancelled: '你已取消 Steam 登入，可以繼續瀏覽。',
          failed: 'Steam 登入未通過驗證，可能是連線中斷、回呼過期或瀏覽器封鎖 Cookie。請重新登入。',
        }[outcome] || '';
      const clean = new URL(location.href);
      clean.searchParams.delete('steam_login');
      history.replaceState(null, '', clean.pathname + clean.search + clean.hash);
    }
  } catch {
    box.innerHTML =
      '<div class="account-card"><div><h3>暫時無法確認登入狀態</h3><p>遊戲探索仍可使用，請稍後再試。</p><button class="button outline" id="retry-account">重新確認</button></div></div>';
  }
}
function renderLibrary() {
  if (!ownedGames) return;
  $('#library-result').innerHTML = ownedGames.length
    ? /* HTML */ `<p class="library-summary">
          已取得 ${ownedGames.length} 款作品 · 依累積遊玩時間排序
        </p>
        <div class="library-list">
          ${ownedGames
            .slice(0, libraryLimit)
            .map(
              (g) =>
                /* HTML */ `<a
                  class="library-row"
                  href="https://store.steampowered.com/app/${g.id}/"
                  target="_blank"
                  rel="noopener noreferrer"
                  ><span>${esc(g.name)}</span
                  ><strong
                    >${esc((g.minutes / 60).toLocaleString('zh-TW', { maximumFractionDigits: 1 }))}
                    小時 ↗</strong
                  ></a
                >`,
            )
            .join('')}
        </div>
        ${ownedGames.length > libraryLimit ? '<button class="text-link" id="more-library">顯示更多作品 ↓</button>' : ''}`
    : '<p class="muted">Steam 回傳的可見遊戲數為 0，目前沒有可列出的作品。</p>';
}
async function loadLibrary() {
  const b = $('#load-library'),
    result = $('#library-result');
  b.disabled = true;
  result.textContent = '正在從 Steam 讀取遊戲庫…';
  try {
    const r = await fetch('/api/me/games', { cache: 'no-store' });
    const d = await r.json();
    if (!r.ok || d.status !== 'ok') {
      result.textContent = d.message || d.error || '暫時無法取得遊戲庫。';
      return;
    }
    ownedGames = d.games;
    libraryLimit = 25;
    renderLibrary();
    render();
  } catch {
    result.textContent = '連線中斷，請稍後重新讀取。';
  } finally {
    b.disabled = false;
  }
}
render();
loadCatalog();
loadCommunity();
loadAccount();
