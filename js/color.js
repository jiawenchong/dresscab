// 顏色工具：從去背後的衣服像素抓出主色，並歸類成穿搭用的「色系」。
// 純函式、不碰 DOM，方便在 Node 裡測試。

export const FAMILIES = {
  black:  { label: '黑',   neutral: true,  hex: '#1f1f1f' },
  white:  { label: '白',   neutral: true,  hex: '#f5f5f2' },
  gray:   { label: '灰',   neutral: true,  hex: '#9a9a9a' },
  beige:  { label: '米/卡其', neutral: true, hex: '#d8c3a0' },
  brown:  { label: '棕',   neutral: true,  hex: '#7a5232' },
  navy:   { label: '深藍', neutral: true,  hex: '#1f2d4d' },
  denim:  { label: '丹寧', neutral: true,  hex: '#5b7aa0' },
  olive:  { label: '軍綠', neutral: true,  hex: '#6b6b3a' },
  red:    { label: '紅',   neutral: false, hex: '#c8323c' },
  pink:   { label: '粉',   neutral: false, hex: '#eba3b8' },
  orange: { label: '橘',   neutral: false, hex: '#e8823a' },
  yellow: { label: '黃',   neutral: false, hex: '#ecc94b' },
  green:  { label: '綠',   neutral: false, hex: '#3f9a5c' },
  blue:   { label: '藍',   neutral: false, hex: '#3a78d8' },
  purple: { label: '紫',   neutral: false, hex: '#8a5cc2' },
};

// 色相（度），用來判斷兩個重點色是不是同色系
export const FAMILY_HUE = {
  red: 355, pink: 340, orange: 25, yellow: 50, green: 130, blue: 215, purple: 275,
};

export function isNeutral(family) {
  return FAMILIES[family]?.neutral ?? true;
}

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const c = max - min;
  let h = 0;
  let s = 0;
  if (c > 0) {
    s = c / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / c) % 6;
    else if (max === g) h = (b - r) / c + 2;
    else h = (r - g) / c + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l, c };
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

export function lightnessOf(hex) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsl(r, g, b).l;
}

export function classifyColor(r, g, b) {
  const { h, s, l, c } = rgbToHsl(r, g, b);

  if (l < 0.13 || (l < 0.2 && c < 0.1)) return 'black';
  if (c < 0.09) {
    if (l > 0.82) return 'white';
    if (l < 0.22) return 'black';
    return 'gray';
  }
  if (l > 0.93) return 'white';

  // 藍色系：深藍 / 丹寧 / 藍
  if (h >= 190 && h < 255) {
    if (l < 0.3) return 'navy';
    if (s < 0.5 && l < 0.72) return 'denim';
    return 'blue';
  }
  // 暖色、低彩度：米、棕、卡其
  if (h >= 15 && h < 55 && c < 0.38) {
    if (l >= 0.55) return 'beige';
    return 'brown';
  }
  if (h >= 55 && h < 95 && c < 0.38 && l < 0.5) return 'olive';
  if (c < 0.16) {
    if (l > 0.82) return 'white';
    if (l < 0.22) return 'black';
    return 'gray';
  }

  if (h >= 345 || h < 12) return l > 0.7 ? 'pink' : 'red';
  if (h < 40) return l < 0.35 ? 'brown' : 'orange';
  if (h < 68) return 'yellow';
  if (h < 175) return 'green';
  if (h < 190) return l < 0.3 ? 'navy' : 'blue';
  if (h < 290) return 'purple';
  if (h < 345) return l > 0.45 ? 'pink' : 'purple';
  return 'gray';
}

// 簡單的確定性 k-means（RGB），回傳依佔比排序的色塊
export function dominantColors(pixels, k = 3, iterations = 10) {
  if (pixels.length === 0) return [];
  // 依亮度排序後取分位數當起始中心，結果穩定、不需要亂數
  const sorted = [...pixels].sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
  const centers = [];
  for (let i = 0; i < k; i++) {
    centers.push([...sorted[Math.floor(((i + 0.5) / k) * sorted.length)]]);
  }
  const assign = new Array(pixels.length).fill(0);
  for (let it = 0; it < iterations; it++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < pixels.length; i++) {
      const p = pixels[i];
      let best = 0;
      let bestD = Infinity;
      for (let j = 0; j < centers.length; j++) {
        const c = centers[j];
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bestD) { bestD = d; best = j; }
      }
      assign[i] = best;
      const s = sums[best];
      s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    }
    for (let j = 0; j < centers.length; j++) {
      const s = sums[j];
      if (s[3] > 0) centers[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
    }
  }
  const counts = centers.map(() => 0);
  for (const a of assign) counts[a]++;
  return centers
    .map((c, j) => ({ rgb: c, share: counts[j] / pixels.length }))
    .filter((x) => x.share > 0)
    .sort((a, b) => b.share - a.share);
}

// 從衣服的像素算出主色、副色和是否有花紋
export function analyzeColors(pixels) {
  const clusters = dominantColors(pixels, 3);
  if (clusters.length === 0) {
    return { color: { hex: '#9a9a9a', family: 'gray' }, color2: null, pattern: false };
  }
  const toColor = ({ rgb }) => ({ hex: rgbToHex(...rgb), family: classifyColor(...rgb) });
  const main = toColor(clusters[0]);
  let color2 = null;
  let pattern = false;
  for (const cl of clusters.slice(1)) {
    if (cl.share < 0.2) continue;
    const other = toColor(cl);
    if (other.family === main.family) continue;
    const a = rgbToHsl(...clusters[0].rgb);
    const b = rgbToHsl(...cl.rgb);
    const hueGap = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
    const bothChromatic = a.c > 0.16 && b.c > 0.16;
    // 皺褶、陰影只會讓同一個顏色變深變淺；真的差很多才算花紋
    if (Math.abs(a.l - b.l) > 0.45 || (bothChromatic && hueGap > 40)) {
      color2 = other;
      pattern = true;
      break;
    }
  }
  return { color: main, color2, pattern };
}
