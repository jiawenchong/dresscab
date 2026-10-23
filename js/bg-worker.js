// 在背景執行緒跑 AI 去背，拍照時畫面不會卡住
import { removeBackground } from '../vendor/bg-removal/bg-removal.js';

self.onmessage = async ({ data }) => {
  const { id, blob, config } = data;
  if (typeof OffscreenCanvas === 'undefined') {
    self.postMessage({ type: 'unsupported', id });
    return;
  }
  try {
    const result = await removeBackground(blob, {
      ...config,
      progress: (key, current, total) => self.postMessage({ type: 'progress', id, key, current, total }),
    });
    self.postMessage({ type: 'done', id, blob: result });
  } catch (err) {
    self.postMessage({ type: 'error', id, message: String(err?.message ?? err) });
  }
};
