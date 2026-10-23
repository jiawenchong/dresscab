import * as db from './db.js';
import { FAMILIES } from './color.js';
import {
  CATEGORIES, SEASONS, STYLES, currentSeason, generateOutfits, learn, missingPieces, outfitSignature,
} from './stylist.js';
import {
  prepareImage, removeBackground, finishCutout, fromOriginal, onModelProgress, warmUpModel,
} from './image.js';
import { exportBackup, importBackup, shareOrDownload } from './backup.js';

const $ = (sel) => document.querySelector(sel);
const BATCH = 6;
const VIEW_TITLES = { closet: '衣櫃', style: '搭配', saved: '收藏', settings: '設定' };

const state = {
  items: [],
  outfits: [],
  weights: {},
  view: 'closet',
  filter: 'all',
  season: currentSeason(),
  style: 'any',
  lockId: null,
  shown: [],          // 目前畫面上的搭配
  seen: new Set(),    // 這一輪已經看過的組合
  liked: new Set(),
};

// ── 小工具 ──
const blobUrls = new WeakMap();
function url(blob) {
  if (!blob) return '';
  let u = blobUrls.get(blob);
  if (!u) {
    u = URL.createObjectURL(blob);
    blobUrls.set(blob, u);
  }
  return u;
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* 私密瀏覽 */ } },
};

const ready = () => state.items.filter((i) => i.status === 'ready');
const byId = (id) => state.items.find((i) => i.id === id);
const chip = (label, attrs, on = false, dot = '') =>
  `<button class="chip${on ? ' on' : ''}" ${attrs}>${dot ? `<span class="dot" style="background:${dot}"></span>` : ''}${label}</button>`;

// ── 畫面切換 ──
function show(view) {
  state.view = view;
  for (const v of Object.keys(VIEW_TITLES)) $(`#view-${v}`).hidden = v !== view;
  for (const b of document.querySelectorAll('.tabbar button')) b.classList.toggle('active', b.dataset.view === view);
  $('#title').textContent = VIEW_TITLES[view];
  render();
  window.scrollTo(0, 0);
}

function render() {
  const n = ready().length;
  $('#subtitle').textContent = state.view === 'closet' && n ? `${n} 件` : '';
  if (state.view === 'closet') renderCloset();
  if (state.view === 'style') renderStyleControls();
  if (state.view === 'saved') renderSaved();
  if (state.view === 'settings') renderSettings();
}

// ── 衣櫃 ──
function renderCloset() {
  const inbox = state.items.filter((i) => i.status !== 'ready');
  $('#inbox').hidden = inbox.length === 0;
  $('#inbox-list').innerHTML = inbox.map((item) => {
    const busy = item.status === 'processing';
    const pic = busy
      ? `<img class="dim" src="${url(item.original)}" alt=""><div class="spinner"></div>`
      : `<img src="${url(item.thumb)}" alt="">`;
    const status = busy
      ? (item.category ? `已選「${CATEGORIES[item.category].label}」· 去背中…` : '去背中…可以先選類別')
      : (item.bgRemoved ? '去背完成！這是什麼？' : '去背不太成功，先用原圖');
    const chips = Object.entries(CATEGORIES)
      .map(([k, c]) => chip(c.label, `data-action="set-cat" data-id="${item.id}" data-cat="${k}"`, item.category === k))
      .join('');
    return `<div class="inbox-card">
      <div class="pic">${pic}</div>
      <div class="side">
        <div class="status-row"><span class="status">${status}</span><button class="icon-btn" data-action="discard" data-id="${item.id}" aria-label="不要這張">✕</button></div>
        <div class="chips">${chips}</div>
      </div>
    </div>`;
  }).join('');

  const items = ready();
  const counts = {};
  for (const i of items) counts[i.category] = (counts[i.category] ?? 0) + 1;
  $('#closet-filter').innerHTML = [
    chip(`全部 ${items.length}`, 'data-action="filter" data-cat="all"', state.filter === 'all'),
    ...Object.entries(CATEGORIES)
      .filter(([k]) => counts[k])
      .map(([k, c]) => chip(`${c.label} ${counts[k]}`, `data-action="filter" data-cat="${k}"`, state.filter === k)),
  ].join('');
  $('#closet-filter').hidden = items.length === 0;

  const shown = items.filter((i) => state.filter === 'all' || i.category === state.filter);
  $('#closet-grid').innerHTML = shown.map((i) => `
    <button class="tile" data-action="open-item" data-id="${i.id}" aria-label="${CATEGORIES[i.category].label}">
      <img src="${url(i.thumb)}" alt="" loading="lazy">
      <span class="dot" style="background:${i.color.hex}"></span>
    </button>`).join('');
  $('#closet-empty').hidden = state.items.length > 0;
}

// ── 新增衣服：拍照 → 自動去背 ──
async function addPhotos(files) {
  for (const file of files) {
    let original;
    try {
      original = await prepareImage(file);
    } catch {
      toast('這張照片讀不到，換一張試試');
      continue;
    }
    const item = {
      id: db.newId(), createdAt: Date.now(), status: 'processing', original,
      category: null, seasons: [], styles: [],
    };
    await db.put('items', item);
    state.items.unshift(item);
    if (state.view !== 'closet') show('closet');
    else render();
    process(item);
  }
}

async function process(item) {
  let result = null;
  try {
    result = await finishCutout(await removeBackground(item.original));
    storage.set('modelReady', '1');
  } catch (err) {
    console.warn('去背失敗', err);
  }
  const bgRemoved = Boolean(result);
  try {
    result ??= await fromOriginal(item.original);
  } catch {
    result = null;
  }
  if (!byId(item.id)) return; // 處理期間被使用者刪掉了
  if (!result) {
    state.items = state.items.filter((i) => i !== item);
    await db.remove('items', item.id);
    render();
    toast('這張照片處理失敗，請再拍一次');
    return;
  }
  Object.assign(item, result, { bgRemoved, status: item.category ? 'ready' : 'inbox' });
  await db.put('items', item);
  $('#model-progress').hidden = true;
  render();
  if (item.status === 'ready') toast(`${CATEGORIES[item.category].label}已收進衣櫃`);
}

const progress = {};
onModelProgress((key, current, total) => {
  if (!key.startsWith('fetch:')) return;
  progress[key] = [current, total];
  let cur = 0;
  let tot = 0;
  for (const [c, t] of Object.values(progress)) { cur += c; tot += t; }
  const mb = (b) => (b / 1048576).toFixed(0);
  $('#model-progress').hidden = cur >= tot;
  $('#model-progress-text').textContent = `第一次使用，正在下載去背模型 ${mb(cur)} / ${mb(tot)} MB（只需要一次）`;
  $('#model-progress-bar').style.width = `${(cur / tot) * 100}%`;
});

// ── 單品編輯面板 ──
function openItem(id) {
  const item = byId(id);
  if (!item) return;
  const sheet = $('#item-sheet');
  renderItemSheet(item);
  if (!sheet.open) sheet.showModal();
}

function renderItemSheet(item) {
  const cats = Object.entries(CATEGORIES)
    .map(([k, c]) => chip(c.label, `data-action="item-cat" data-cat="${k}"`, item.category === k)).join('');
  const colors = Object.entries(FAMILIES)
    .map(([k, f]) => chip(f.label, `data-action="item-color" data-fam="${k}"`, item.color.family === k, k === item.color.family ? item.color.hex : f.hex))
    .join('');
  const seasons = Object.entries(SEASONS)
    .map(([k, s]) => chip(s, `data-action="item-season" data-key="${k}"`, item.seasons.includes(k))).join('');
  const styles = Object.entries(STYLES)
    .map(([k, s]) => chip(s, `data-action="item-style" data-key="${k}"`, item.styles.includes(k))).join('');
  $('#item-sheet-body').dataset.id = item.id;
  $('#item-sheet-body').innerHTML = `
    <div class="sheet-grip"></div>
    <div class="sheet-head"><button class="icon-btn" data-action="close-sheet" aria-label="關閉">✕</button></div>
    <div class="sheet-pic"><img src="${url(item.image)}" alt=""></div>
    <div class="field"><div class="label">類別</div><div class="chips">${cats}</div></div>
    <div class="field"><div class="label">顏色 <span>（自動判斷，不對可以改）</span></div><div class="chips">${colors}</div></div>
    <div class="field"><div class="label">花紋</div><div class="chips">
      ${chip('素色', 'data-action="item-pattern" data-val="0"', !item.pattern)}
      ${chip('有花紋 / 條紋', 'data-action="item-pattern" data-val="1"', item.pattern)}
    </div></div>
    <div class="field"><div class="label">季節 <span>${item.seasons.length ? '' : '（沒選＝四季都可以）'}</span></div><div class="chips">${seasons}</div></div>
    <div class="field"><div class="label">風格 <span>${item.styles.length ? '' : '（沒選＝什麼場合都行）'}</span></div><div class="chips">${styles}</div></div>
    <button class="primary big" data-action="style-with">✨ 用這件幫我搭配</button>
    <div class="btn-row">
      <button class="secondary" data-action="${item.bgRemoved ? 'use-original' : 'retry-bg'}">${item.bgRemoved ? '改用原圖' : '重新去背'}</button>
      <button class="danger" data-action="delete-item">刪除</button>
    </div>`;
}

async function updateItem(item, changes) {
  Object.assign(item, changes);
  await db.put('items', item);
  resetSeen();
  renderItemSheet(item);
  render();
}

function toggle(list, key) {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

// ── 搭配 ──
function renderStyleControls() {
  $('#season-chips').innerHTML = Object.entries(SEASONS)
    .map(([k, s]) => chip(s, `data-action="season" data-key="${k}"`, state.season === k)).join('');
  $('#style-chips').innerHTML = [['any', '不限'], ...Object.entries(STYLES)]
    .map(([k, s]) => chip(s, `data-action="style" data-key="${k}"`, state.style === k)).join('');
  const locked = byId(state.lockId);
  $('#lock-row').hidden = !locked;
  if (locked) {
    $('#lock-chip').innerHTML = `<button class="chip on" data-action="unlock">
      <img src="${url(locked.thumb)}" alt="" style="width:22px;height:22px;object-fit:contain">
      ${CATEGORIES[locked.category].label} ✕</button>`;
  }
  renderOutfits();
}

function resetSeen() {
  state.seen = new Set();
  state.shown = [];
}

function generate(more = false) {
  if (more) for (const o of state.shown) state.seen.add(o.signature);
  else resetSeen();
  const opts = { season: state.season, style: state.style };
  const missing = missingPieces(ready(), opts);
  const msg = $('#style-msg');
  if (missing && !state.lockId) {
    state.shown = [];
    msg.hidden = false;
    msg.textContent = ready().length
      ? `這個季節／風格的衣服不夠：${missing}。也可以把單品的季節或風格設定放寬一點。`
      : '衣櫃還是空的，先去拍幾件衣服吧！';
    renderOutfits();
    return;
  }
  state.shown = generateOutfits(ready(), {
    ...opts, lockId: state.lockId, count: BATCH, weights: state.weights, exclude: state.seen,
  });
  msg.hidden = state.shown.length > 0;
  msg.textContent = state.seen.size
    ? '能配的組合都看過了！按「幫我搭配」從頭再來，或多拍幾件衣服。'
    : '找不到合適的組合，試試別的季節或風格。';
  renderOutfits();
  if (more) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function boardHtml(items) {
  const main = items.filter((i) => ['top', 'dress', 'bottom'].includes(i.category));
  const side = items.filter((i) => ['outer', 'bag', 'shoes'].includes(i.category));
  const piece = (i) => `<div class="piece ${i.category}"><img src="${url(i.thumb)}" alt="${CATEGORIES[i.category].label}"></div>`;
  return `<div class="board">
    <div class="col main">${main.map(piece).join('')}</div>
    ${side.length ? `<div class="col side">${side.map(piece).join('')}</div>` : ''}
  </div>`;
}

function renderOutfits() {
  $('#btn-generate').textContent = state.shown.length ? '✨ 重新搭配' : '✨ 幫我搭配';
  $('#outfit-list').innerHTML = state.shown.map((o, idx) => {
    const liked = state.liked.has(o.signature);
    return `<article class="outfit" data-idx="${idx}">
      ${boardHtml(o.items)}
      <div class="reasons">${o.reasons.slice(0, 3).map((r) => `<span class="reason">${r}</span>`).join('')}</div>
      <div class="outfit-actions">
        <button data-action="dislike" data-idx="${idx}">👎 不喜歡</button>
        <button data-action="like" data-idx="${idx}" class="${liked ? 'liked' : ''}">${liked ? '❤️ 已收藏' : '🤍 收藏'}</button>
      </div>
    </article>`;
  }).join('');
  $('#btn-more').hidden = state.shown.length === 0;
}

async function like(idx) {
  const o = state.shown[idx];
  if (!o || state.liked.has(o.signature)) return;
  state.liked.add(o.signature);
  state.weights = learn(state.weights, o.items, true);
  await db.setKV('weights', state.weights);
  if (!state.outfits.some((s) => s.signature === o.signature)) {
    const saved = { id: db.newId(), createdAt: Date.now(), itemIds: o.items.map((i) => i.id), reasons: o.reasons, signature: o.signature };
    state.outfits.unshift(saved);
    await db.put('outfits', saved);
  }
  renderOutfits();
  toast('已收藏，之後會多推薦類似的');
}

async function dislike(idx, card) {
  const o = state.shown[idx];
  if (!o) return;
  state.weights = learn(state.weights, o.items, false);
  await db.setKV('weights', state.weights);
  state.seen.add(o.signature);
  card.classList.add('leaving');
  setTimeout(() => {
    state.shown = state.shown.filter((x) => x !== o);
    renderOutfits();
  }, 250);
}

// ── 收藏 ──
function renderSaved() {
  const list = state.outfits
    .map((o) => ({ ...o, items: o.itemIds.map(byId).filter((i) => i?.status === 'ready') }))
    .filter((o) => o.items.length >= 2);
  $('#saved-empty').hidden = list.length > 0;
  $('#saved-list').innerHTML = list.map((o) => `
    <article class="outfit">
      ${boardHtml(o.items)}
      <div class="meta">
        <span>${new Date(o.createdAt).toLocaleDateString('zh-TW')}</span>
        <button data-action="unsave" data-id="${o.id}">移除</button>
      </div>
    </article>`).join('');
}

// ── 設定 ──
async function renderSettings() {
  $('#model-status').textContent = storage.get('modelReady')
    ? '✅ 已經下載好了，可以離線去背。'
    : '還沒下載。第一次拍照時會自動下載（約 55 MB），之後就不用了。';
  const est = await navigator.storage?.estimate?.();
  const persisted = await navigator.storage?.persisted?.();
  const parts = [`衣服 ${ready().length} 件、收藏 ${state.outfits.length} 套。`];
  if (est) parts.push(`已使用約 ${(est.usage / 1048576).toFixed(0)} MB。`);
  parts.push(persisted ? '✅ 已設定為永久保存。' : '提醒：加到主畫面使用，資料比較不會被清掉。');
  $('#storage-status').textContent = parts.join('');
}

// ── 事件 ──
const actions = {
  'set-cat': async ({ id, cat }) => {
    const item = byId(id);
    item.category = cat;
    if (item.status === 'inbox') {
      item.status = 'ready';
      toast(`${CATEGORIES[cat].label}已收進衣櫃`);
    }
    await db.put('items', item);
    resetSeen();
    render();
  },
  discard: async ({ id }) => {
    state.items = state.items.filter((i) => i.id !== id);
    await db.remove('items', id);
    render();
  },
  filter: ({ cat }) => { state.filter = cat; render(); },
  'open-item': ({ id }) => openItem(id),
  'close-sheet': () => $('#item-sheet').close(),
  'item-cat': ({ cat }, item) => updateItem(item, { category: cat }),
  'item-color': ({ fam }, item) => updateItem(item, {
    color: { family: fam, hex: fam === item.color.family ? item.color.hex : FAMILIES[fam].hex },
  }),
  'item-pattern': ({ val }, item) => updateItem(item, { pattern: val === '1' }),
  'item-season': ({ key }, item) => updateItem(item, { seasons: toggle(item.seasons, key) }),
  'item-style': ({ key }, item) => updateItem(item, { styles: toggle(item.styles, key) }),
  'style-with': (_, item) => {
    $('#item-sheet').close();
    state.lockId = item.id;
    if (item.seasons.length && !item.seasons.includes(state.season)) state.season = item.seasons[0];
    show('style');
    generate();
  },
  'use-original': async (_, item) => {
    await updateItem(item, { ...(await fromOriginal(item.original)), bgRemoved: false });
  },
  'retry-bg': async (_, item) => {
    toast('重新去背中…');
    try {
      const result = await finishCutout(await removeBackground(item.original));
      if (!result) throw new Error('empty');
      await updateItem(item, { ...result, bgRemoved: true });
      toast('去背完成');
    } catch {
      toast('還是去不掉，換個背景重拍會比較好');
    }
  },
  'delete-item': async (_, item) => {
    if (!confirm('確定要刪除這件衣服嗎？包含它的收藏搭配也會一起刪掉。')) return;
    $('#item-sheet').close();
    state.items = state.items.filter((i) => i !== item);
    await db.remove('items', item.id);
    for (const o of state.outfits.filter((x) => x.itemIds.includes(item.id))) await db.remove('outfits', o.id);
    state.outfits = state.outfits.filter((x) => !x.itemIds.includes(item.id));
    if (state.lockId === item.id) state.lockId = null;
    resetSeen();
    render();
    toast('已刪除');
  },
  season: ({ key }) => { state.season = key; resetSeen(); renderStyleControls(); },
  style: ({ key }) => { state.style = key; resetSeen(); renderStyleControls(); },
  unlock: () => { state.lockId = null; resetSeen(); renderStyleControls(); },
  like: ({ idx }) => like(Number(idx)),
  dislike: ({ idx }, _, el) => dislike(Number(idx), el.closest('.outfit')),
  unsave: async ({ id }) => {
    state.outfits = state.outfits.filter((o) => o.id !== id);
    await db.remove('outfits', id);
    render();
  },
  'dismiss-install': () => { storage.set('installTipDismissed', '1'); $('#install-tip').hidden = true; },
  warmup: async () => {
    toast('開始下載去背模型…');
    show('closet');
    try {
      await warmUpModel();
      storage.set('modelReady', '1');
      $('#model-progress').hidden = true;
      toast('模型下載好了！');
    } catch {
      $('#model-progress').hidden = true;
      toast('下載失敗，請確認網路後再試一次');
    }
  },
  export: async () => {
    toast('正在打包備份…');
    try {
      await shareOrDownload(await exportBackup());
    } catch (err) {
      toast(`備份失敗：${err.message}`);
    }
  },
  import: () => $('#input-backup').click(),
  wipe: async () => {
    if (!confirm('確定要刪除所有衣服和收藏嗎？這個動作無法復原。')) return;
    if (!confirm('真的確定嗎？建議先匯出備份。')) return;
    await Promise.all(['items', 'outfits', 'kv'].map((s) => db.clear(s)));
    Object.assign(state, { items: [], outfits: [], weights: {}, lockId: null, liked: new Set() });
    resetSeen();
    render();
    toast('已全部清除');
  },
};

document.addEventListener('click', (e) => {
  const tab = e.target.closest('.tabbar button');
  if (tab) {
    show(tab.dataset.view);
    return;
  }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  const sheetId = el.closest('#item-sheet-body')?.dataset.id;
  fn(el.dataset, sheetId ? byId(sheetId) : null, el);
});

// 點面板外面的灰色區域就關閉
$('#item-sheet').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.close();
});

$('#fab-camera').addEventListener('click', () => $('#input-camera').click());
$('#fab-library').addEventListener('click', () => $('#input-library').click());
for (const id of ['#input-camera', '#input-library']) {
  $(id).addEventListener('change', (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    addPhotos(files);
  });
}
$('#input-backup').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const n = await importBackup(file);
    await load();
    render();
    toast(`已匯入 ${n} 件衣服`);
  } catch (err) {
    toast(`匯入失敗：${err.message}`);
  }
});
$('#btn-generate').addEventListener('click', () => generate(false));
$('#btn-more').addEventListener('click', () => generate(true));

// ── 啟動 ──
async function load() {
  state.items = (await db.getAll('items')).sort((a, b) => b.createdAt - a.createdAt);
  state.outfits = (await db.getAll('outfits')).sort((a, b) => b.createdAt - a.createdAt);
  state.weights = await db.getKV('weights', {});
  state.liked = new Set(state.outfits.map((o) => o.signature ?? outfitSignature(o.itemIds.map((id) => ({ id })))));
}

async function init() {
  await load();
  render();
  // 上次關掉 app 時還沒處理完的照片，繼續處理
  for (const item of state.items.filter((i) => i.status === 'processing')) process(item);

  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  $('#install-tip').hidden = !isIOS || standalone || Boolean(storage.get('installTipDismissed'));

  navigator.storage?.persist?.();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
