// 搭配引擎：用造型規則（結構、配色、季節、風格）幫衣櫃裡的單品打分數，
// 挑出最好看又彼此不重複的組合。按讚 / 不喜歡會慢慢調整權重。

import { FAMILIES, FAMILY_HUE, isNeutral, lightnessOf } from './color.js';

export const CATEGORIES = {
  top:    { label: '上衣' },
  bottom: { label: '下身' },
  dress:  { label: '連身' },
  outer:  { label: '外套' },
  shoes:  { label: '鞋子' },
  bag:    { label: '包包' },
};

export const SEASONS = {
  spring: '春', summer: '夏', autumn: '秋', winter: '冬',
};

export const STYLES = {
  casual: '休閒', office: '上班', formal: '正式', sport: '運動',
};

// 單品順序：畫面與簽章都用這個順序
const ORDER = ['outer', 'top', 'dress', 'bottom', 'shoes', 'bag'];
const MAX_COMBOS = 60000;

export function currentSeason(date = new Date()) {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

export function outfitSignature(items) {
  return items.map((i) => i.id).sort().join('|');
}

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function hueGap(a, b) {
  const d = Math.abs(FAMILY_HUE[a] - FAMILY_HUE[b]);
  return Math.min(d, 360 - d);
}

function itemColors(item) {
  const list = [item.color.family];
  if (item.pattern && item.color2) list.push(item.color2.family);
  return list;
}

// 回傳 { score, reasons }；reasons 是給使用者看的搭配理由
export function scoreOutfit(items, weights = {}) {
  let score = 0;
  const reasons = [];
  const byCat = Object.fromEntries(items.map((i) => [i.category, i]));

  // ── 配色 ──
  const accents = new Map(); // family -> 出現次數
  for (const item of items) {
    for (const fam of itemColors(item)) {
      if (!isNeutral(fam)) accents.set(fam, (accents.get(fam) ?? 0) + 1);
    }
  }
  const accentList = [...accents.keys()];
  if (accentList.length === 0) {
    score += 1;
    reasons.push('中性色組合，簡約耐看');
  } else if (accentList.length === 1) {
    const fam = accentList[0];
    score += 2;
    if (accents.get(fam) >= 2) {
      score += 0.6;
      reasons.push(`${FAMILIES[fam].label}色前後呼應`);
    } else {
      reasons.push(`${FAMILIES[fam].label}色當重點色`);
    }
  } else if (accentList.length === 2) {
    const gap = hueGap(accentList[0], accentList[1]);
    if (gap <= 50) {
      score += 1;
      reasons.push('相近色系，很協調');
    } else if (gap >= 150) {
      score -= 0.6;
      reasons.push('撞色比較大膽');
    } else {
      score -= 1.5;
    }
  } else {
    score -= 3;
  }

  // ── 花紋：最多一件 ──
  const patterned = items.filter((i) => i.pattern).length;
  if (patterned === 1) {
    score += 0.3;
    reasons.push('花紋單品當主角');
  } else if (patterned >= 2) {
    score -= 2.5;
  }

  // ── 上下身深淺 ──
  const upper = byCat.top;
  const lower = byCat.bottom;
  if (upper && lower) {
    if (upper.color.family === lower.color.family) {
      score += 0.8;
      reasons.push('同色系上下身，看起來顯高');
    } else if (Math.abs(lightnessOf(upper.color.hex) - lightnessOf(lower.color.hex)) >= 0.25) {
      score += 0.6;
      reasons.push('上下深淺對比，有層次');
    }
  }

  // ── 鞋子、外套 ──
  const shoes = byCat.shoes;
  if (shoes) {
    const fam = shoes.color.family;
    const echoed = !isNeutral(fam) && items.some((i) => i !== shoes && itemColors(i).includes(fam));
    if (echoed) {
      score += 0.6;
      reasons.push('鞋子和衣服顏色呼應');
    } else if (isNeutral(fam)) {
      score += 0.3;
    }
  }
  if (byCat.outer && isNeutral(byCat.outer.color.family)) score += 0.3;

  // ── 風格 ──
  const styled = items.filter((i) => i.styles?.length);
  if (styled.length >= 2) {
    let common = new Set(styled[0].styles);
    for (const i of styled.slice(1)) common = new Set(i.styles.filter((s) => common.has(s)));
    if (common.size === 0) {
      score -= 2.5;
    } else if (styled.length === items.length) {
      score += 0.5;
      reasons.push(`整體都是${STYLES[[...common][0]]}風`);
    }
  }

  // ── 你按過的讚 / 不喜歡 ──
  const pw = weights.pairs ?? {};
  const cw = weights.colors ?? {};
  let learned = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      learned += pw[pairKey(items[i].id, items[j].id)] ?? 0;
      learned += (cw[pairKey(items[i].color.family, items[j].color.family)] ?? 0) * 0.5;
    }
  }
  if (learned > 0.5) reasons.push('跟你喜歡過的搭配很像');
  score += Math.max(-3, Math.min(3, learned * 0.5));

  return { score, reasons };
}

function fits(item, season, style) {
  if (season && item.seasons?.length && !item.seasons.includes(season)) return false;
  if (style && style !== 'any' && item.styles?.length && !item.styles.includes(style)) return false;
  return true;
}

// 檢查衣櫃夠不夠拿來搭配；不夠的話回傳原因
export function missingPieces(items, { season, style } = {}) {
  const ok = items.filter((i) => fits(i, season, style));
  const has = (c) => ok.some((i) => i.category === c);
  if (has('dress') || (has('top') && has('bottom'))) return null;
  if (!has('top') && !has('dress')) return '還需要至少一件上衣或連身';
  return '還需要至少一件下身（褲子或裙子）';
}

/**
 * 產生搭配。
 * @param items     衣櫃單品
 * @param options   { season, style, lockId, count, weights, exclude: Set<signature>, random }
 */
export function generateOutfits(items, options = {}) {
  const {
    season, style, lockId, count = 6, weights = {}, exclude = new Set(), random = Math.random,
  } = options;

  const locked = items.find((i) => i.id === lockId);
  const pool = {};
  for (const c of ORDER) pool[c] = [];
  for (const item of items) {
    if (item === locked || fits(item, season, style)) pool[item.category]?.push(item);
  }
  if (locked) {
    pool[locked.category] = [locked];
    if (locked.category === 'dress') { pool.top = []; pool.bottom = []; }
    if (locked.category === 'top' || locked.category === 'bottom') pool.dress = [];
  }

  const bases = [];
  for (const t of pool.top) for (const b of pool.bottom) bases.push([t, b]);
  for (const d of pool.dress) bases.push([d]);
  if (bases.length === 0) return [];

  // 冬天一定加外套；春秋可加可不加；夏天不加（除非指定了外套）
  let outers = [null];
  if (pool.outer.length) {
    if (locked?.category === 'outer' || season === 'winter') outers = pool.outer;
    else if (season !== 'summer') outers = [null, ...pool.outer];
  }
  const shoes = pool.shoes.length ? pool.shoes : [null];
  const bags = locked?.category === 'bag' ? pool.bag : [null];

  const total = bases.length * outers.length * shoes.length * bags.length;
  const pick = (arr) => arr[Math.floor(random() * arr.length)];
  const candidates = [];
  const build = (base, outer, shoe, bag) => [outer, ...base, shoe, bag].filter(Boolean);

  if (total <= MAX_COMBOS) {
    for (const base of bases) for (const o of outers) for (const s of shoes) for (const g of bags) {
      candidates.push(build(base, o, s, g));
    }
  } else {
    for (let n = 0; n < MAX_COMBOS; n++) {
      candidates.push(build(pick(bases), pick(outers), pick(shoes), pick(bags)));
    }
  }

  const scored = [];
  const seen = new Set();
  for (const outfitItems of candidates) {
    const sig = outfitSignature(outfitItems);
    if (exclude.has(sig) || seen.has(sig)) continue;
    seen.add(sig);
    const { score, reasons } = scoreOutfit(outfitItems, weights);
    // 一點點隨機，讓每次「換一批」都有新鮮感
    scored.push({ items: outfitItems, score: score + random() * 0.8, reasons, signature: sig });
  }
  scored.sort((a, b) => b.score - a.score);

  // 包包：挑最搭的一個（不強制）
  if (pool.bag.length && locked?.category !== 'bag') {
    for (const o of scored.slice(0, count * 4)) {
      let best = null;
      let bestScore = scoreOutfit(o.items, weights).score;
      for (const bag of pool.bag) {
        const s = scoreOutfit([...o.items, bag], weights).score;
        if (s > bestScore) { bestScore = s; best = bag; }
      }
      if (best) {
        o.items = [...o.items, best];
        o.reasons = scoreOutfit(o.items, weights).reasons;
        // signature 維持不含包包，這樣「換一批」才不會換個包包又出現同一套
      }
    }
  }

  // 多樣性：同一批裡每件單品出現次數有上限（依那一類有幾件來算，鞋子只有一雙就不限），不夠再放寬
  const cap = (item, factor) => Math.max(2, Math.ceil(count / pool[item.category].length)) * factor;
  const result = [];
  for (const factor of [1, 1.5, Infinity]) {
    const uses = new Map();
    for (const o of result) for (const i of o.items) uses.set(i.id, (uses.get(i.id) ?? 0) + 1);
    for (const o of scored) {
      if (result.length >= count) break;
      if (result.includes(o)) continue;
      if (o.items.some((i) => i !== locked && (uses.get(i.id) ?? 0) >= cap(i, factor))) continue;
      result.push(o);
      for (const i of o.items) uses.set(i.id, (uses.get(i.id) ?? 0) + 1);
    }
    if (factor === Infinity || result.length >= count) break;
  }

  for (const o of result) {
    o.items.sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category));
  }
  return result;
}

// 按讚 / 不喜歡後更新權重（回傳新的 weights，不改動原物件）
export function learn(weights, items, liked) {
  const delta = liked ? 1 : -1;
  const pairs = { ...(weights.pairs ?? {}) };
  const colors = { ...(weights.colors ?? {}) };
  const clamp = (v) => Math.max(-3, Math.min(3, v));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const pk = pairKey(items[i].id, items[j].id);
      pairs[pk] = clamp((pairs[pk] ?? 0) + delta);
      const ck = pairKey(items[i].color.family, items[j].color.family);
      colors[ck] = clamp((colors[ck] ?? 0) + delta * 0.5);
    }
  }
  return { pairs, colors };
}
