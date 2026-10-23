# DressCab 電子衣櫥

拍照 → 自動去背 → 自動幫你搭配的電子衣櫥。iPhone 優先設計，放在 GitHub Pages 上，完全免費。

- 📸 **拍了就好**：拍照後自動去背、裁切、抓顏色；你只要點一下「上衣／下身／外套…」
- ✨ **自動搭配**：依配色、季節、風格規則一次配出好幾套，不喜歡就「換一批」
- 👍 **越用越懂你**：收藏或按不喜歡，之後的推薦會跟著調整
- 🔒 **照片不會上傳**：去背的 AI 模型直接在手機上跑，資料只存在你的手機裡
- 📴 **可以離線用**：加到主畫面之後就像一般 app

## 在 iPhone 上使用

1. 用 Safari 打開 `https://<你的帳號>.github.io/dresscab/`
2. 點下方「分享」→「加入主畫面」
3. 從主畫面打開，按右下角相機開始拍衣服

第一次拍照會下載去背模型（約 55 MB，建議連 Wi-Fi），之後就不用再下載。

**拍照小技巧**：衣服平放在床上或地上（背景和衣服顏色差多一點），或掛在門上拍，光線亮一點效果最好。

## 開啟 GitHub Pages

Repo 的 **Settings → Pages → Build and deployment**：
- Source 選 **Deploy from a branch**
- Branch 選要發佈的分支，資料夾選 **/ (root)**，按 Save

一兩分鐘後網址就會出現在同一頁。這個專案沒有建置步驟，檔案原封不動就是網站。

## 搭配規則（`js/stylist.js`）

| 規則 | 說明 |
|---|---|
| 結構 | 上衣＋下身，或連身；有鞋子就配鞋子；冬天一定加外套、春秋可加可不加、夏天不加 |
| 配色 | 黑白灰、米、棕、深藍、丹寧、軍綠當中性色；只有一個重點色加分、相近色加分、三個以上重點色扣分 |
| 花紋 | 一套最多一件花紋單品 |
| 深淺 | 上下身同色系或深淺對比加分 |
| 風格 | 休閒／上班／正式／運動互相衝突會扣分 |
| 你的喜好 | 收藏過的單品組合、顏色組合加分；按過不喜歡的扣分 |

## 開發

```bash
npm test          # 跑配色與搭配引擎的單元測試（不需要安裝任何套件）
npm run serve     # 在 http://localhost:8000 開啟
```

| 檔案 | 用途 |
|---|---|
| `js/app.js` | 畫面與操作 |
| `js/stylist.js` | 搭配引擎 |
| `js/color.js` | 抓主色、色系分類、花紋判斷 |
| `js/image.js`、`js/bg-worker.js` | 照片縮小、AI 去背（在背景執行緒）、裁切與縮圖 |
| `js/db.js` | IndexedDB 儲存 |
| `js/backup.js` | 匯出／匯入備份 |
| `sw.js` | 離線快取 |
| `vendor/bg-removal/` | 打包好的去背函式庫與模型，由 `tools/vendor-bg-removal.sh` 產生 |

## 授權

去背使用 [@imgly/background-removal](https://github.com/imgly/background-removal-js) 1.4.5（AGPL-3.0），授權全文在 `vendor/bg-removal/LICENSE.md`。
