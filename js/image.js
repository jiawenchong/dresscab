// 照片處理流程：縮小 → AI 去背 → 裁掉透明邊 → 縮圖 → 抓顏色

import { analyzeColors } from './color.js';

const MAX_INPUT = 1024;  // 送進去背模型的尺寸（模型本身就是 1024）
const MAX_IMAGE = 800;   // 存起來的去背圖
const MAX_THUMB = 320;   // 衣櫃格子用的縮圖

const BG_CONFIG = {
  publicPath: new URL('../vendor/bg-removal/data/', import.meta.url).href,
  model: 'small',
  proxyToWorker: false,
  output: { format: 'image/png' },
};

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toBlob(c, type = 'image/png', quality) {
  return new Promise((resolve) => c.toBlob(resolve, type, quality));
}

function fitSize(w, h, max) {
  const s = Math.min(1, max / Math.max(w, h));
  return [Math.round(w * s), Math.round(h * s)];
}

// 手機原圖通常很大，先縮到 1024 再處理，速度快很多也比較不會爆記憶體
export async function prepareImage(file) {
  const bmp = await createImageBitmap(file);
  const [w, h] = fitSize(bmp.width, bmp.height, MAX_INPUT);
  const c = canvas(w, h);
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return toBlob(c, 'image/jpeg', 0.9);
}

// ── 去背：一次處理一張，排隊進行 ──
let worker = null;
let useMainThread = false;
let jobSeq = 0;
const jobs = new Map();
let progressListener = () => {};

export function onModelProgress(fn) {
  progressListener = fn;
}

function getWorker() {
  if (worker || useMainThread) return worker;
  try {
    worker = new Worker(new URL('./bg-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const job = jobs.get(data.id);
      if (data.type === 'progress') {
        progressListener(data.key, data.current, data.total);
        return;
      }
      if (!job) return;
      jobs.delete(data.id);
      if (data.type === 'done') job.resolve(data.blob);
      else if (data.type === 'unsupported') {
        useMainThread = true;
        worker.terminate();
        worker = null;
        removeOnMainThread(job.blob).then(job.resolve, job.reject);
      } else job.reject(new Error(data.message));
    };
    worker.onerror = (e) => {
      // 舊版 Safari 不支援 module worker，改在主執行緒跑
      e.preventDefault?.();
      useMainThread = true;
      worker?.terminate();
      worker = null;
      for (const [id, job] of jobs) {
        jobs.delete(id);
        removeOnMainThread(job.blob).then(job.resolve, job.reject);
      }
    };
  } catch {
    useMainThread = true;
  }
  return worker;
}

async function removeOnMainThread(blob) {
  const { removeBackground } = await import('../vendor/bg-removal/bg-removal.js');
  return removeBackground(blob, { ...BG_CONFIG, progress: (k, c, t) => progressListener(k, c, t) });
}

let queue = Promise.resolve();

export function removeBackground(blob) {
  const run = () => {
    const w = getWorker();
    if (!w) return removeOnMainThread(blob);
    return new Promise((resolve, reject) => {
      const id = ++jobSeq;
      jobs.set(id, { resolve, reject, blob });
      w.postMessage({ id, blob, config: BG_CONFIG });
    });
  };
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}

// ── 去背後整理：裁掉透明邊、縮圖、抓顏色 ──
async function readPixels(blob) {
  const bmp = await createImageBitmap(blob);
  const c = canvas(bmp.width, bmp.height);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  return { c, data: ctx.getImageData(0, 0, c.width, c.height).data };
}

async function resized(source, sx, sy, sw, sh, max) {
  const [w, h] = fitSize(sw, sh, max);
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
  return c;
}

function samplePixels(data, width, x0, y0, x1, y1, useAlpha) {
  const pixels = [];
  const area = (x1 - x0) * (y1 - y0);
  const step = Math.max(1, Math.floor(Math.sqrt(area / 6000)));
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * width + x) * 4;
      if (useAlpha && data[i + 3] < 200) continue;
      pixels.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  return pixels;
}

// 回傳 { image, thumb, color, color2, pattern }，去背結果不能用時回傳 null
export async function finishCutout(pngBlob) {
  const { c, data } = await readPixels(pngBlob);
  const { width, height } = c;
  let minX = width, minY = height, maxX = -1, maxY = -1, solid = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 20) {
        solid++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  // 幾乎什麼都沒留下 → 模型沒抓到衣服
  if (solid < width * height * 0.03) return null;

  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.04);
  const sx = Math.max(0, minX - pad);
  const sy = Math.max(0, minY - pad);
  const sw = Math.min(width, maxX + pad + 1) - sx;
  const sh = Math.min(height, maxY + pad + 1) - sy;

  const image = await toBlob(await resized(c, sx, sy, sw, sh, MAX_IMAGE));
  const thumb = await toBlob(await resized(c, sx, sy, sw, sh, MAX_THUMB));
  const colors = analyzeColors(samplePixels(data, width, minX, minY, maxX + 1, maxY + 1, true));
  return { image, thumb, ...colors };
}

// 不去背：直接用原圖（顏色取中間區域）
export async function fromOriginal(jpegBlob) {
  const { c, data } = await readPixels(jpegBlob);
  const { width, height } = c;
  const image = await toBlob(await resized(c, 0, 0, width, height, MAX_IMAGE), 'image/jpeg', 0.88);
  const thumb = await toBlob(await resized(c, 0, 0, width, height, MAX_THUMB), 'image/jpeg', 0.85);
  const colors = analyzeColors(samplePixels(
    data, width, Math.round(width * 0.3), Math.round(height * 0.3), Math.round(width * 0.7), Math.round(height * 0.7), false,
  ));
  return { image, thumb, ...colors };
}

// 先下載模型（建議 Wi-Fi）：拿一張小圖跑一次去背
export async function warmUpModel() {
  const c = canvas(64, 64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#eee';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#c33';
  ctx.fillRect(16, 12, 32, 40);
  await removeBackground(await toBlob(c));
}
