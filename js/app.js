import { catalog } from './catalog.js';
import { setupNavigation } from './navigation.js';
import { minigames } from './minigames.js';
import { deployment, sitePath, apiPath } from './site-config.js';
const $ = (s) => document.querySelector(s);
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const validId = (id) => catalog.some((g) => g.id === Number(id));
let page = document.body.dataset.page;
let viewVersion = 0;
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
function readSaved() {
  const stored = readStorage('pq-saved', []);
  return new Set(Array.isArray(stored) ? stored.filter(validId).map(Number) : []);
}
let saved = readSaved();
let games = catalog.map((g) => ({ ...g, price: null })),
  gamePage = 1,
  type = 'all',
  query = '',
  genre = 'all',
  sort = 'featured',
  activeId = null,
  previousFocus = null,
  detailToken = 0;
const details = new Map();
let ownedGames = null,
  libraryValue = null,
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
        src="${esc(sitePath(g.image || '/images/' + g.id + '.jpg'))}"
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
  $('#saved-count').textContent = saved.size;
  if (!$('#game-grid')) return;
  const availableGames = page === 'indie' ? games.filter((g) => g.indie) : games;
  let list = availableGames.filter(
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
  const limit = Number($('#game-grid').dataset.limit);
  const matched = list.length;
  const totalPages = Math.max(1, Math.ceil(matched / 24));
  gamePage = Math.min(gamePage, totalPages);
  if (limit > 0) list = list.slice(0, limit);
  else list = list.slice((gamePage - 1) * 24, gamePage * 24);
  $('#game-grid').innerHTML = list.map(card).join('');
  $('#empty').hidden = list.length > 0;
  $('#result-count').textContent =
    `符合 ${matched} 款 · 本頁 ${list.length} 款 / 共收錄 ${availableGames.length} 款遊戲`;
  const pagination = $('#game-pagination');
  if (pagination) {
    pagination.hidden = totalPages <= 1;
    pagination.innerHTML = `<button class="button outline" data-game-page="${gamePage - 1}" ${gamePage === 1 ? 'disabled' : ''}>← 上一頁</button><span>第 ${gamePage} / ${totalPages} 頁</span><button class="button outline" data-game-page="${gamePage + 1}" ${gamePage === totalPages ? 'disabled' : ''}>下一頁 →</button>`;
  }
  document.querySelectorAll('[data-type]').forEach((b) => {
    b.classList.toggle('selected', b.dataset.type === type);
    b.setAttribute('aria-pressed', String(b.dataset.type === type));
  });
}
function renderDeals() {
  if (!$('#deals-grid')) return;
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
                  src="${esc(sitePath(g.image || '/images/' + g.id + '.jpg'))}"
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
function updateSaleEvent() {
  const event = $('.sale-event');
  const status = $('#scream-status');
  if (!event || !status) return;
  const now = Date.now();
  status.textContent =
    now >= Date.parse(event.dataset.end)
      ? '活動已結束'
      : now < Date.parse(event.dataset.start)
        ? '即將開始'
        : '正在進行';
}
setInterval(updateSaleEvent, 60000);
async function loadCatalog() {
  if (!$('#data-status')) return;
  const version = viewVersion;
  $('#refresh').disabled = true;
  $('#data-status').textContent = '正在取得 Steam 台灣區價格…';
  try {
    let offset = 0;
    let checked = 0;
    do {
      const r = await fetch(apiPath('/api/catalog?offset=' + offset));
      if (!r.ok) throw new Error();
      const data = await r.json();
      if (version !== viewVersion) return;
      if (!Array.isArray(data.games)) throw new Error();
      const updates = new Map(data.games.filter((g) => validId(g.id)).map((g) => [g.id, g]));
      games = games.map((g) => updates.get(g.id) || g);
      checked += data.games.length;
      $('#data-status').textContent =
        `正在更新 Steam 台灣區價格：${checked} / ${catalog.length} 款…`;
      if (data.nextOffset === null) break;
      if (!Number.isInteger(data.nextOffset) || data.nextOffset <= offset) throw new Error();
      offset = data.nextOffset;
    } while (true);
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
    if (version !== viewVersion) return;
    $('#data-status').textContent =
      'Steam 目前無法連線。仍可瀏覽精選介紹，價格未取得的作品不列入優惠。';
    renderDeals();
  } finally {
    if (version === viewVersion) $('#refresh').disabled = false;
  }
}
function setType(value) {
  gamePage = 1;
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
function reviewHTML(r, g) {
  const sourceLink = r.steamid
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
    <div class="review-bottom">
      <span>評價時遊玩 ${esc(r.hours)} 小時</span>
      <div class="review-actions">
        ${r.text?.trim() ? `<a class="text-link" href="${esc('https://translate.google.com/?' + new URLSearchParams({ sl: 'auto', tl: 'zh-TW', text: r.text, op: 'translate' }))}" target="_blank" rel="noopener noreferrer" title="在 Google 翻譯開啟（新分頁）">翻譯成繁體中文 ↗</a>` : ''}
        ${sourceLink}
      </div>
    </div>
  </article>`;
}
async function getDetail(id) {
  if (details.has(id)) return details.get(id);
  const r = await fetch(apiPath('/api/game/' + id));
  if (!r.ok) throw new Error();
  const d = await r.json();
  details.set(id, d);
  return d;
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
      src="${esc(sitePath(g.image || '/images/' + id + '.jpg'))}"
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
          頁面為準。${g.descriptionSource ? '介紹來源：' + esc(g.descriptionSource) + '。' : '介紹為本站編輯摘要。'}
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
  const paginationButton = e.target.closest('[data-game-page]');
  if (paginationButton && !paginationButton.disabled) {
    gamePage = Math.max(1, Number(paginationButton.dataset.gamePage) || 1);
    render();
    $('#explore')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
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
  if (e.target.closest('#load-library')) loadLibrary();
  if (e.target.closest('#more-library')) {
    libraryLimit += 25;
    renderLibrary();
  }
  if (e.target.closest('#retry-account')) loadAccount();
});
document.addEventListener('submit', (e) => {
  if (e.target.matches('form[action="/auth/steam/logout"]')) {
    try {
      sessionStorage.removeItem('pq-owned');
    } catch {}
    return;
  }
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
function bindPageControls() {
  if ($('#mini-search')) {
    const filterMinigames = () => {
      const query = $('#mini-search').value.trim().toLowerCase();
      const category = $('#mini-category').value;
      const matches = minigames.filter(
        (g) =>
          (category === 'all' ||
            (category === 'tsuyatt' ? g.creator === 'tsuyatt' : g.category === category)) &&
          [g.name, g.original, g.creator, g.description].join(' ').toLowerCase().includes(query),
      );
      $('#mini-count').textContent = `顯示 ${matches.length} / ${minigames.length} 款`;
      $('#mini-grid').innerHTML =
        matches
          .map(
            (g) =>
              /* HTML */ ` <article class="mini-card">
                <a
                  href="${esc(g.url)}"
                  target="_blank"
                  rel="noopener noreferrer"
                  tabindex="-1"
                  aria-hidden="true"
                  ><img
                    src="${esc(sitePath(g.image))}"
                    alt=""
                    width="1200"
                    height="630"
                    loading="lazy"
                /></a>
                <div class="mini-card-content">
                  <div class="mini-card-tags">
                    <span class="label purple">${esc(g.category)}</span
                    ><span>${esc(g.language)}</span>
                  </div>
                  <p class="mini-creator">${esc(g.creator)} · ${esc(g.original)}</p>
                  <h2>${esc(g.name)}</h2>
                  <p>${esc(g.description)}</p>
                  <a
                    class="button outline"
                    href="${esc(g.url)}"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="在原站開啟 ${esc(g.name)}（新分頁）"
                    >到原站玩 ↗</a
                  >
                  <span class="mini-domain">${esc(new URL(g.url).hostname)} · 原站圖片</span>
                </div>
              </article>`,
          )
          .join('') ||
        '<div class="empty"><h2>沒有符合的遊戲</h2><p>試試其他關鍵字或分類。</p></div>';
    };
    $('#mini-search').addEventListener('input', filterMinigames);
    $('#mini-category').addEventListener('change', filterMinigames);
    filterMinigames();
  }
  $('#search')?.addEventListener('input', (e) => {
    gamePage = 1;
    query = e.target.value.trim().toLowerCase();
    render();
  });
  if ($('#genre')) {
    $('#genre').innerHTML += [
      ...new Set(catalog.filter((g) => page !== 'indie' || g.indie).map((g) => g.genre)),
    ]
      .map((g) => /* HTML */ `<option>${esc(g)}</option>`)
      .join('');
  }
  $('#genre')?.addEventListener('change', (e) => {
    gamePage = 1;
    genre = e.target.value;
    render();
  });
  $('#sort')?.addEventListener('change', (e) => {
    gamePage = 1;
    sort = e.target.value;
    render();
  });
  $('#reset-filters')?.addEventListener('click', () => {
    query = '';
    genre = 'all';
    sort = 'featured';
    if ($('#search')) $('#search').value = '';
    if ($('#genre')) $('#genre').value = 'all';
    if ($('#sort')) $('#sort').value = 'featured';
    setType('all');
  });
  $('#refresh')?.addEventListener('click', loadCatalog);
  $('#all-indie')?.addEventListener('click', () => {
    setType('all');
    $('#explore').scrollIntoView();
  });
}
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
    $('#search') &&
    !dialog.open &&
    !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
  ) {
    e.preventDefault();
    $('#search').focus();
    $('#explore').scrollIntoView();
  }
});
async function loadAccount() {
  const box = $('#account-content');
  if (!box) return;
  const version = viewVersion;
  try {
    const c = await fetch('/auth/steam/config', { cache: 'no-store' });
    if (!c.ok) throw Error();
    const config = await c.json();
    if (version !== viewVersion) return;
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
    if (version !== viewVersion) return;
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
    const resultParams = new URL(location.href).searchParams;
    const outcome = resultParams.get('steam_login');
    if (outcome) {
      $('#account-notice').textContent =
        {
          success: 'Steam 登入成功。',
          cancelled: '你已取消 Steam 登入，可以繼續瀏覽。',
          failed:
            {
              state_missing:
                'Steam 登入返回時沒有收到驗證 Cookie。請在同一瀏覽器開啟網站並重新登入；若持續發生，請檢查網站的 Cookie 設定。',
              state_invalid:
                '這次登入的驗證資料已過期或失效。請從本站重新按 Steam 登入，並在 10 分鐘內完成。',
              state_mismatch: '登入資料與這次操作不一致。請關閉其他登入分頁，再從本站重新登入。',
              assertion_invalid:
                'Steam 回傳的登入資料未通過安全檢查。請重新登入；若持續發生，請將查詢編號提供給網站管理者。',
              steam_unavailable: '網站暫時無法連上 Steam 驗證服務，請稍後重新登入。',
              steam_rejected:
                'Steam 未確認這次登入。請從本站重新登入，避免重新整理先前的登入回呼頁面。',
              storage_unavailable: '網站的登入驗證儲存服務暫時異常，請將查詢編號提供給網站管理者。',
              callback_used: '這次登入回呼已經使用過。請回到本站重新按 Steam 登入。',
              session_failed: '網站無法建立登入狀態，請將查詢編號提供給網站管理者。',
            }[resultParams.get('reason')] || 'Steam 登入未通過驗證，請從本站重新登入。',
        }[outcome] || '';
      const reference = resultParams.get('ref') || '';
      if (outcome === 'failed' && /^[0-9a-f-]{36}$/.test(reference))
        $('#account-notice').textContent += ' 查詢編號：' + reference;
      const clean = new URL(location.href);
      clean.searchParams.delete('steam_login');
      clean.searchParams.delete('reason');
      clean.searchParams.delete('ref');
      history.replaceState(null, '', clean.pathname + clean.search + clean.hash);
    }
  } catch {
    if (version !== viewVersion) return;
    box.innerHTML =
      '<div class="account-card"><div><h3>暫時無法確認登入狀態</h3><p>遊戲探索仍可使用，請稍後再試。</p><button class="button outline" id="retry-account">重新確認</button></div></div>';
  }
}
document.addEventListener(
  'error',
  (event) => {
    if (event.target instanceof HTMLImageElement && event.target.matches('.library-cover img'))
      event.target.remove();
  },
  true,
);
function renderLibrary() {
  if (!ownedGames) return;
  const totalMinutes = ownedGames.reduce((sum, g) => sum + (g.minutes || 0), 0);
  const number = (value) => value.toLocaleString('zh-TW');
  const valueText = libraryValue?.priced
    ? 'NT$ ' + (libraryValue.total / 100).toLocaleString('zh-TW', { maximumFractionDigits: 2 })
    : libraryValue?.done && !ownedGames.length
      ? 'NT$ 0'
      : '尚無估值';
  $('#library-result').innerHTML = /* HTML */ ` <div class="library-stats">
      <div class="library-stat-count">
        <span>已擁有遊戲</span><strong>${number(ownedGames.length)}<small> 款</small></strong>
        <span>Steam 可見遊戲庫</span>
      </div>
      <div class="library-stat-time">
        <span>總遊玩時數</span
        ><strong>${number(Math.floor(totalMinutes / 60))}<small> 小時</small></strong>
        <span>另 ${number(totalMinutes % 60)} 分鐘</span>
      </div>
      <div class="library-stat-value">
        <span>台灣商店現價估值${libraryValue?.priced < ownedGames.length ? '（部分）' : ''}</span
        ><strong>${valueText}</strong>
        <span
          >${libraryValue?.failed ? '部分報價未完成' : libraryValue?.done ? `${number(libraryValue.priced)} 款已取得報價` : '報價查詢中'}</span
        >
      </div>
    </div>
    <div class="library-valuation-status" role="status">
      ${libraryValue?.failed ? '部分報價讀取失敗，可重新讀取遊戲庫重試。' : libraryValue?.done ? `已完成報價查詢；${number(libraryValue.priced)} 款有報價，${number(libraryValue.unpriced)} 款無報價。` : `正在查詢報價：${number(libraryValue?.checked || 0)} / ${number(ownedGames.length)} 款。`}
      ${!libraryValue?.done && !libraryValue?.failed ? `<progress value="${libraryValue?.checked || 0}" max="${Math.max(ownedGames.length, 1)}" aria-label="遊戲報價查詢進度"></progress>` : ''}
    </div>
    <details class="library-calculation">
      <summary>估值與時數如何計算？</summary>
      <p>
        依 Steam
        台灣商店目前售價估算，含當下折扣，非實際購買花費。免費、下架或未提供報價的作品不計入金額。時數為
        Steam 回傳的可見遊戲時數加總。
      </p>
    </details>
    ${
      ownedGames.length
        ? /* HTML */ `<div class="library-collection-heading">
              <h4>我的遊戲收藏</h4>
              <span
                >依累積遊玩時間排序 · 顯示 ${Math.min(libraryLimit, ownedGames.length)} /
                ${ownedGames.length} 款</span
              >
            </div>
            <div class="library-grid">
              ${ownedGames
                .slice(0, libraryLimit)
                .map(
                  (g, index) =>
                    /* HTML */ `<a
                      class="library-game"
                      href="https://store.steampowered.com/app/${g.id}/"
                      target="_blank"
                      rel="noopener noreferrer"
                      ><div class="library-cover">
                        <span class="library-cover-placeholder" aria-hidden="true"
                          >${esc(g.name)}</span
                        >
                        <img
                          src="https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${g.id}/header.jpg"
                          alt=""
                          width="460"
                          height="215"
                          loading="lazy"
                        />
                        ${index < 3 && g.minutes > 0 ? `<span class="library-rank">遊玩 TOP ${index + 1}</span>` : ''}
                      </div>
                      <div class="library-game-info">
                        <h5>${esc(g.name)}</h5>
                        <div class="library-game-time">
                          <span>${g.minutes ? '累積遊玩' : '尚未遊玩'}</span
                          ><strong
                            >${esc((g.minutes / 60).toLocaleString('zh-TW', { maximumFractionDigits: 1 }))}
                            小時</strong
                          >
                        </div>
                        <meter
                          min="0"
                          max="${Math.max(ownedGames[0]?.minutes || 0, 1)}"
                          value="${g.minutes}"
                          aria-label="${esc(g.name)} 相對最長遊玩時數"
                        ></meter>
                        <span class="library-store-link"
                          >前往 Steam 商店 <span aria-hidden="true">↗</span></span
                        >
                      </div></a
                    >`,
                )
                .join('')}
            </div>
            ${ownedGames.length > libraryLimit ? '<button class="button outline library-more" id="more-library">顯示更多遊戲 ↓</button>' : ''}`
        : '<p class="muted">Steam 回傳的可見遊戲數為 0，目前沒有可列出的作品。</p>'
    }`;
}
async function loadLibraryValue(version) {
  libraryValue = { total: 0, priced: 0, unpriced: 0, checked: 0, done: !ownedGames.length };
  renderLibrary();
  let offset = 0;
  try {
    while (ownedGames.length) {
      const response = await fetch('/api/me/games/value?offset=' + offset, { cache: 'no-store' });
      const data = await response.json();
      if (version !== viewVersion) return;
      if (!response.ok || data.status !== 'ok' || data.count !== ownedGames.length) throw Error();
      for (const field of ['total', 'priced', 'unpriced', 'checked'])
        libraryValue[field] += data[field];
      libraryValue.done = data.nextOffset === null;
      renderLibrary();
      if (libraryValue.done) return;
      offset = data.nextOffset;
    }
  } catch {
    if (version !== viewVersion) return;
    libraryValue.failed = true;
    renderLibrary();
  }
}
async function loadLibrary() {
  const version = viewVersion;
  const b = $('#load-library'),
    result = $('#library-result');
  b.disabled = true;
  result.textContent = '正在從 Steam 讀取遊戲庫…';
  try {
    const r = await fetch('/api/me/games', { cache: 'no-store' });
    const d = await r.json();
    if (version !== viewVersion) return;
    if (!r.ok || d.status !== 'ok') {
      result.textContent = d.message || d.error || '暫時無法取得遊戲庫。';
      return;
    }
    ownedGames = d.games;
    try {
      sessionStorage.setItem(
        'pq-owned',
        JSON.stringify({ steamid: currentUser.steamid, ids: d.games.map((game) => game.id) }),
      );
    } catch {}
    libraryLimit = 25;
    render();
    await loadLibraryValue(version);
  } catch {
    if (version !== viewVersion) return;
    result.textContent = '連線中斷，請稍後重新讀取。';
  } finally {
    b.disabled = false;
  }
}
async function restoreOwnedGames() {
  if (!$('#game-grid')) return;
  if (deployment.apiOrigin) return;
  const version = viewVersion;
  ownedGames = null;
  render();
  try {
    const response = await fetch('/api/me', { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    if (version !== viewVersion) return;
    if (!data.authenticated) {
      sessionStorage.removeItem('pq-owned');
      return;
    }
    const stored = JSON.parse(sessionStorage.getItem('pq-owned'));
    if (stored?.steamid === data.user.steamid && Array.isArray(stored.ids)) {
      ownedGames = stored.ids.filter((id) => Number.isInteger(id) && id > 0).map((id) => ({ id }));
      render();
    } else {
      sessionStorage.removeItem('pq-owned');
    }
  } catch {
    // 分頁儲存或 Steam 驗證不可用時，仍可使用一般遊戲瀏覽。
  }
}
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  saved = readSaved();
  render();
  restoreOwnedGames();
  loadAccount();
});
function initializePage() {
  gamePage = 1;
  updateSaleEvent();
  page = document.body.dataset.page;
  const selected = new URLSearchParams(location.search).get('filter');
  type = ['saved', 'indie', 'solo'].includes(selected) ? selected : 'all';
  query = '';
  genre = 'all';
  sort = 'featured';
  saved = readSaved();
  bindPageControls();
  render();
  loadCatalog();
  loadAccount();
  restoreOwnedGames();
}

setupNavigation({
  beforeChange() {
    viewVersion++;
    detailToken++;
    if (dialog.open) dialog.close();
    activeId = null;
  },
  afterChange: initializePage,
});

// 舊書籤仍會轉到對應路徑；一般選單改在同一份文件內切換內容。
const legacyPages = {
  '#explore': '/games',
  '#indie': '/indie',
  '#deals': '/deals',
  '#community': '/games',
  '#account': '/account',
};
if (location.pathname === sitePath('/') && legacyPages[location.hash]) {
  location.replace(sitePath(legacyPages[location.hash]) + location.search);
} else {
  initializePage();
}
