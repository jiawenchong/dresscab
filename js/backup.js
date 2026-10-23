// 備份：把衣櫃（含照片）打包成一個 .json 檔，可以存到「檔案」或 iCloud Drive

import * as db from './db.js';

const BLOB_FIELDS = ['image', 'thumb', 'original'];

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function dataURLToBlob(url) {
  return (await fetch(url)).blob();
}

export async function exportBackup() {
  const items = await db.getAll('items');
  const outfits = await db.getAll('outfits');
  const kv = await db.getAll('kv');
  // 分段組成 Blob，避免一次產生超大字串讓 iPhone 記憶體不夠
  const parts = [`{"app":"dresscab","version":1,"exportedAt":"${new Date().toISOString()}","items":[`];
  for (let i = 0; i < items.length; i++) {
    const copy = { ...items[i] };
    for (const f of BLOB_FIELDS) if (copy[f] instanceof Blob) copy[f] = await blobToDataURL(copy[f]);
    parts.push((i ? ',' : '') + JSON.stringify(copy));
  }
  parts.push(`],"outfits":${JSON.stringify(outfits)},"kv":${JSON.stringify(kv)}}`);
  const date = new Date().toISOString().slice(0, 10);
  return new File(parts, `dresscab-backup-${date}.json`, { type: 'application/json' });
}

export async function shareOrDownload(file) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// 匯入：同一個 id 會被覆蓋，其他資料保留
export async function importBackup(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'dresscab' || !Array.isArray(data.items)) throw new Error('這不是 DressCab 的備份檔');
  for (const item of data.items) {
    for (const f of BLOB_FIELDS) if (typeof item[f] === 'string') item[f] = await dataURLToBlob(item[f]);
    await db.put('items', item);
  }
  for (const o of data.outfits ?? []) await db.put('outfits', o);
  for (const row of data.kv ?? []) await db.put('kv', row);
  return data.items.length;
}
