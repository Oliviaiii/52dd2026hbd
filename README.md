# 生日刮刮卡中獎序號查詢

這是一個可以直接部署到 GitHub Pages 的純靜態網站。不需要登入或後端，序號比對、照片辨識與查詢紀錄都在使用者的瀏覽器內完成。

目前是活動資料尚未公布前的基礎版本：畫面與查詢流程已完成，但 `data/prizes.json` 中沒有任何正式中獎序號。

## 已完成的功能

- 單筆輸入或一次貼上多組序號
- 手機拍照或上傳圖片，以 Tesseract.js 在瀏覽器內辨識
- 查詢結果與歷史紀錄儲存在目前瀏覽器，可逐筆刪除
- 查詢紀錄匯出 CSV
- 可從公開 Google Sheet 自動同步中獎名單，失敗時改用網站備份
- 中獎名單格式、重複序號與公布狀態會在部署前自動檢查
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

### 2. 使用 Google Sheet 管理中獎名單（建議）

這個網站是純 GitHub Pages，無法安全連接私人試算表。請建立一份只放公開中獎資料的 Google Sheet，然後依照 [Google 官方說明](https://support.google.com/docs/answer/183965?hl=zh-Hant) 使用「檔案 → 共用 → 發布到網路」，選擇包含中獎名單的工作表並發布為 CSV。

建議分成兩張工作表：

`獎項設定` 用來管理獎項與數量：

| 獎項 | 數量 | 備註 |
| --- | ---: | --- |
| 現金 31 萬 | 1 | |

`中獎序號` 是網站實際讀取的工作表，第一列欄位請使用：

| 狀態 | 更新時間 | 獎項 | 開獎序號 | 備註 |
| --- | --- | --- | --- | --- |
| draft | 2026-10-20T11:30:00+08:00 | 頭獎：簽名拍立得 |  | |
| | | 頭獎：簽名拍立得 |  | |
| | | 二獎：生日限定小卡 |  | |

- 編輯期間保持 `draft`，所有訪客只會看到「中獎名單尚未公布」。
- 全部輸入並檢查完成後，將第一筆狀態改成 `announced`。
- `更新時間` 建議使用含時區的 ISO 格式，例如 `2026-10-20T12:00:00+08:00`。
- 獎項已依照數量預先展開成每個名額一列，開獎時只要填寫 `開獎序號`。
- 每列只放一組開獎序號，不要刪除或排序已填寫序號的列，避免獎項與序號錯位。
- 若活動臨時加碼，先在 `獎項設定` 最下方新增獎項與數量，再於 `中獎序號` 最下方新增相同數量的獎項列；不要插入前面的既有資料。
- 試算表發布後任何人都能讀取內容，因此不要放姓名、電話或其他個資。

把發布後的 CSV 網址填入 `data/config.json`：

```json
{
  "winnerSource": {
    "type": "google-sheets-csv",
    "url": "https://docs.google.com/spreadsheets/d/e/.../pub?output=csv",
    "refreshSeconds": 60
  }
}
```

網站開啟時會同步一次，頁面停留期間每 60 秒更新，也可以按「更新中獎名單」立即重抓。若 Google Sheet 暫時無法連線，會顯示提示並改用 `data/prizes.json` 的網站備份。

### 3. 網站備份中獎名單

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
- 同一序號不得重複出現在不同獎項；測試會阻止錯誤資料部署。
- 已公布狀態必須有至少一組中獎序號和有效的 `updatedAt`。
- JSON 不支援註解，最後一個項目後方不能多加逗號。

### 4. 新增獎項圖片

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
- 因為是靜態網站，Google Sheet 與 `data/prizes.json` 的完整中獎名單都可以被訪客查看。
