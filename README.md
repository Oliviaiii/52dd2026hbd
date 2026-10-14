# 生日刮刮卡中獎序號查詢

這是一個可以直接部署到 GitHub Pages 的純靜態網站。不需要登入或後端，序號比對、照片辨識與查詢紀錄都在使用者的瀏覽器內完成。

目前是活動資料尚未公布前的基礎版本：畫面與查詢流程已完成，但 `data/prizes.json` 中沒有任何正式中獎序號。

## 已完成的功能

- 單筆輸入或一次貼上多組序號
- 手機拍照或上傳圖片，以 Tesseract.js 在瀏覽器內辨識
- 查詢結果與歷史紀錄儲存在目前瀏覽器，可逐筆刪除
- 查詢紀錄匯出 CSV
- 手機、平板與桌面版響應式介面
- PWA 基礎設定與離線應用外殼
- 實際活動主視覺與可滑動、可放大的獎項圖片總覽
- GitHub Actions 自動測試並部署 GitHub Pages

## 本機預覽

需要 Node.js 18 以上版本：

```powershell
npm start
```

開啟 <http://127.0.0.1:4173>。不要直接用檔案總管開啟 `index.html`，因為瀏覽器在 `file://` 模式下無法載入 JSON 設定。

執行測試：

```powershell
npm test
```

## 活動資料設定

### 1. 活動名稱與序號格式

修改 `data/config.json`：

```json
{
  "event": {
    "siteName": "OOO 生日慶刮刮卡",
    "brandName": "OOO 生日慶",
    "description": "輸入刮刮卡上的序號，立即確認是否中獎。"
  },
  "serial": {
    "minLength": 8,
    "maxLength": 8,
    "allowedPattern": "^[A-Z0-9]+$"
  }
}
```

等拿到實際刮刮卡後，再依照序號長度、是否有連字號及英文字母調整這裡。

### 2. 公布中獎名單

修改 `data/prizes.json`：

```json
{
  "status": "announced",
  "updatedAt": "2026-10-20T12:00:00+08:00",
  "prizes": [
    {
      "name": "頭獎：簽名拍立得",
      "codes": ["A001-ABCD", "A002-EFGH"]
    },
    {
      "name": "二獎：生日限定小卡",
      "codes": ["B001-IJKL", "B002-MNOP"]
    }
  ]
}
```

注意事項：

- 正式公布前保持 `"status": "not_announced"`。
- 正式公布時改成 `"status": "announced"`。
- 序號比對不分英文字母大小寫，全形英數字也會自動正規化。
- 同一序號若重複出現在不同獎項，只會採用第一筆資料。
- JSON 不支援註解，最後一個項目後方不能多加逗號。

### 3. 新增獎項圖片

1. 將 JPG、PNG 或 WebP 圖片放入 `img/`。
2. 在 `data/gallery.json` 的 `items` 陣列新增一筆：

```json
{
  "title": "獎項總覽 19",
  "src": "img/prizes-09.jpg",
  "alt": "大蒂宮 2026 生日慶第十九張獎項總覽",
  "crop": { "top": 120, "bottom": 1500, "width": 869, "height": 1884 }
}
```

`crop` 使用原圖像素設定實際活動海報範圍，列表與放大畫面都不會顯示手機狀態列、Instagram 操作列或留言區。

獎品文字清單放在 `data/prize-catalog.json`。每個品項都需要填寫 `quantity` 與 `name`；新增後網站會自動更新款數、總名額與搜尋結果。

## 部署到 GitHub Pages

1. 在 GitHub 建立新的 repository。
2. 將這個資料夾 commit 並 push 到 `main` 分支。
3. 到 repository 的 **Settings → Pages**。
4. 將 **Source** 選成 **GitHub Actions**。
5. 等候 `Deploy static site to GitHub Pages` workflow 完成。

之後只要更新 `main` 分支，測試通過後就會自動部署。

## 圖片辨識的目前範圍

OCR 使用固定版本的 Tesseract.js，只有使用者按下「開始辨識」時才會由 jsDelivr 載入。照片不會上傳到本站，但第一次辨識需要網路連線下載辨識引擎。

目前尚未知道刮刮卡版面與序號字體，因此先採通用英數辨識。拿到實體照片後，建議再補上：

- 自動裁切序號區域
- 亮度、對比與黑白化處理
- 容易混淆字元的校正規則，例如 `O / 0`、`I / 1`
- 實際手機照片測試案例

## 隱私與限制

- 網站不會將輸入序號、照片或歷史紀錄傳送到自有伺服器。
- 紀錄使用 `localStorage` 保存，清除瀏覽器網站資料或更換裝置後不會保留。
- 此工具只提供快速比對；得獎與領獎資格仍以活動主辦單位公告為準。
- 因為是靜態網站，`data/prizes.json` 的完整中獎名單可以被訪客查看。
