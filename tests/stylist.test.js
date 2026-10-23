import test from 'node:test';
import assert from 'node:assert/strict';
import { generateOutfits, scoreOutfit, learn, missingPieces, outfitSignature } from '../js/stylist.js';

let n = 0;
const item = (category, family, hex, extra = {}) => ({
  id: `${category}-${family}-${n++}`, category, color: { family, hex }, color2: null, pattern: false,
  seasons: [], styles: [], ...extra,
});

const wardrobe = () => {
  n = 0;
  return [
    item('top', 'white', '#f5f5f2'),
    item('top', 'red', '#c0392b'),
    item('top', 'green', '#27ae60'),
    item('bottom', 'denim', '#4f6d94'),
    item('bottom', 'black', '#1f1f1f'),
    item('bottom', 'pink', '#f4b6c2'),
    item('dress', 'navy', '#1b2a4a', { seasons: ['summer'] }),
    item('outer', 'beige', '#d8c3a0', { seasons: ['autumn', 'winter'] }),
    item('shoes', 'white', '#f5f5f2'),
    item('shoes', 'red', '#c0392b'),
  ];
};
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('衣服不夠時告訴使用者缺什麼', () => {
  assert.match(missingPieces([item('top', 'white', '#fff')]), /下身/);
  assert.match(missingPieces([item('shoes', 'white', '#fff')]), /上衣/);
  assert.equal(missingPieces([item('dress', 'navy', '#1b2a4a')]), null);
});

test('每套都有完整結構，且不重複', () => {
  const outfits = generateOutfits(wardrobe(), { season: 'spring', count: 6, random: seeded() });
  assert.equal(outfits.length, 6);
  const sigs = new Set(outfits.map((o) => o.signature));
  assert.equal(sigs.size, 6);
  for (const o of outfits) {
    const cats = o.items.map((i) => i.category);
    assert.ok(cats.includes('dress') || (cats.includes('top') && cats.includes('bottom')), cats.join());
    assert.ok(cats.includes('shoes'));
  }
});

test('配色規則：一個重點色比三個重點色高分', () => {
  const w = wardrobe();
  const calm = [w[0], w[3], w[9]];   // 白上衣 + 丹寧 + 紅鞋
  const loud = [w[1], w[5], w[2]];   // 紅 + 粉 + 綠
  assert.ok(scoreOutfit(calm).score > scoreOutfit(loud).score);
});

test('季節：夏天不加外套，冬天一定有外套，連身裙只在夏天', () => {
  const w = wardrobe();
  const summer = generateOutfits(w, { season: 'summer', count: 20, random: seeded() });
  assert.ok(summer.every((o) => !o.items.some((i) => i.category === 'outer')));
  assert.ok(summer.some((o) => o.items.some((i) => i.category === 'dress')));
  const winter = generateOutfits(w, { season: 'winter', count: 20, random: seeded() });
  assert.ok(winter.length > 0);
  assert.ok(winter.every((o) => o.items.some((i) => i.category === 'outer')));
  assert.ok(winter.every((o) => !o.items.some((i) => i.category === 'dress')));
});

test('鎖定單品：每套都包含那一件', () => {
  const w = wardrobe();
  const locked = w[5];
  const outfits = generateOutfits(w, { season: 'spring', lockId: locked.id, count: 6, random: seeded() });
  assert.ok(outfits.length > 0);
  assert.ok(outfits.every((o) => o.items.includes(locked)));
});

test('換一批不會出現已經看過的組合', () => {
  const w = wardrobe();
  const first = generateOutfits(w, { season: 'spring', count: 4, random: seeded(3) });
  const exclude = new Set(first.map((o) => o.signature));
  const second = generateOutfits(w, { season: 'spring', count: 4, exclude, random: seeded(4) });
  for (const o of second) assert.ok(!exclude.has(o.signature));
});

test('風格衝突的組合會被扣分', () => {
  const w = wardrobe();
  const top = { ...w[0], styles: ['sport'] };
  const bottom = { ...w[4], styles: ['formal'] };
  const same = { ...w[4], styles: ['sport'] };
  assert.ok(scoreOutfit([top, bottom]).score < scoreOutfit([top, same]).score);
});

test('按讚會讓同樣的搭配分數變高', () => {
  const w = wardrobe();
  const outfit = [w[2], w[5], w[8]];
  const before = scoreOutfit(outfit).score;
  const weights = learn(learn({}, outfit, true), outfit, true);
  assert.ok(scoreOutfit(outfit, weights).score > before);
  const disliked = learn({}, outfit, false);
  assert.ok(scoreOutfit(outfit, disliked).score < before);
  assert.equal(outfitSignature(outfit), outfitSignature([...outfit].reverse()));
});

test('只有一雙鞋時，上衣也會輪流出現', () => {
  n = 0;
  const w = [
    item('top', 'white', '#f5f5f2'), item('top', 'red', '#c0392b'),
    item('bottom', 'denim', '#4f6d94'), item('bottom', 'black', '#1f1f1f'), item('bottom', 'pink', '#f4b6c2'),
    item('shoes', 'white', '#f5f5f2'),
  ];
  const outfits = generateOutfits(w, { season: 'spring', count: 6, random: seeded() });
  assert.equal(outfits.length, 6);
  const tops = outfits.map((o) => o.items.find((i) => i.category === 'top').id);
  assert.equal(tops.filter((id) => id === w[0].id).length, 3);
});
