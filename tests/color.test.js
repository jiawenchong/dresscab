import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyColor, analyzeColors, hexToRgb } from '../js/color.js';

const fam = (hex) => classifyColor(...hexToRgb(hex));

test('常見衣服顏色歸類', () => {
  const cases = {
    '#111111': 'black', '#2b2b2b': 'black', '#ffffff': 'white', '#f0eee8': 'white',
    '#808080': 'gray', '#b5b5b5': 'gray',
    '#e3d3b8': 'beige', '#c8ad7f': 'beige', '#6b4226': 'brown',
    '#1b2a4a': 'navy', '#4f6d94': 'denim', '#6f8fb5': 'denim',
    '#5a5a2e': 'olive',
    '#c0392b': 'red', '#f4b6c2': 'pink', '#e67e22': 'orange', '#f1c40f': 'yellow',
    '#27ae60': 'green', '#2e86de': 'blue', '#8e44ad': 'purple',
  };
  for (const [hex, expected] of Object.entries(cases)) {
    assert.equal(fam(hex), expected, hex);
  }
});

test('素色衣服的陰影不算花紋', () => {
  const pixels = [];
  for (let i = 0; i < 600; i++) pixels.push([30, 45, 80]); // 深藍
  for (let i = 0; i < 300; i++) pixels.push([50, 70, 115]); // 亮面
  for (let i = 0; i < 100; i++) pixels.push([15, 22, 40]);  // 陰影
  const r = analyzeColors(pixels);
  assert.equal(r.pattern, false);
});

test('黑白條紋算花紋', () => {
  const pixels = [];
  for (let i = 0; i < 550; i++) pixels.push([20, 20, 20]);
  for (let i = 0; i < 450; i++) pixels.push([240, 240, 238]);
  const r = analyzeColors(pixels);
  assert.equal(r.pattern, true);
  assert.deepEqual([r.color.family, r.color2.family].sort(), ['black', 'white']);
});
