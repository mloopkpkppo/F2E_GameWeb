# PIXEL QUEST｜遊戲探索基地

繁體中文像素遊戲介紹網站。使用原生 HTML、CSS、JavaScript 與 Node.js 內建模組；不用安裝第三方套件或資料庫。

## 啟動

需安裝 Node.js 22 以上版本（建議 LTS）。在這個資料夾開啟終端機，執行 `npm start`，再開啟 http://localhost:3000 。也可以雙擊「啟動網站.cmd」。按 Ctrl+C 停止伺服器。

請透過本機伺服器使用；直接雙擊 index.html 或只有靜態檔案的 Live Server 無法執行 Steam 後端串接。

## 資料夾

- index.html：網頁結構與文案。
- css/style.css：全站樣式、手機版排版。
- images/：本地遊戲封面、原創像素主視覺與圖示。
- js/app.js：前端搜尋、篩選、排序、收藏、試用留言。
- js/catalog.js：精選名單、繁中介紹與獨立／個人開發標籤。
- js/api.mjs：Steam 串接、價格處理、快取與錯誤處理。
- js/server.mjs：本機預覽伺服器。
- js/download-assets.mjs：依精選名單下載封面。
- js/api.test.mjs：資料處理與 API 保護測試。
- js/build.mjs：部署封裝程式。
- .openai/hosting.json：私人預覽站設定，無金鑰。
- dist/：執行 npm run build 產生的部署檔案，不用直接編輯。

## 第一版功能

收錄 12 款 Steam 作品，包含 8 款獨立遊戲、其中 3 款個人開發起家的作品。提供搜尋、類型與分類篩選、價格與折扣排序、收藏、遊戲介紹視窗、截圖、發售日、在線人數、評價比例及 Steam 評論。

特價區只列出已取得目前折扣的作品。缺資料不顯示為免費。支援鍵盤操作、Esc 關閉介紹及搜尋快捷鍵 `/`。

## 資料來源與保存

- 遊戲精選與介紹：js/catalog.js 人工編輯，不是全 Steam 掃描。Steam 與獨立遊戲是重疊分類，不是互斥平台。
- 個人開發：標註原始開發背景，不代表資產、協作者及後續版本均為一人完成。
- 圖片：Steam Store 封面存於 images，各作品與商標權利歸原權利人。pixel-world.svg 為本站製作的裝飾圖，不是遊戲截圖。
- 價格與發售資料：Steam Store api/appdetails，cc=tw、l=tchinese。此商店介面沒有穩定性保證；失敗時顯示暫無資料。
- 評論：Steam Web API IUserReviewsService/GetAppReviews/v1，所有語言、Steam 購買範圍，顯示原文與來源連結；不是本站使用者評論。排序與資料量受 Steam 控制。
- 在線人數：ISteamUserStats/GetNumberOfCurrentPlayers/v1，只代表 Steam，不是全平台人數。
- 伺服器快取：每個程序記憶體保存 10 分鐘，重啟會消失。上游失敗可回傳上次成功值並標示；舊值不列入目前優惠。
- 收藏與試用留言：瀏覽器 localStorage，保留最近 100 則筆記。只在此瀏覽器保存，不公開、不跨裝置同步；清除網站資料會消失。正式多人留言需另加資料庫、登入及審核機制。
- SteamDB：僅外部連結，沒有爬取其資料。
- 字型：Google Fonts 的 DotGothic16 與 Noto Sans TC；無法連線時使用系統字型。

## 新增遊戲

1. 修改 js/catalog.js，新增 AppID、名稱、類型、開發者及介紹。
2. 執行 `node js/download-assets.mjs` 下載封面至 images。
3. 重新整理頁面，本機價格由後端自動讀取。部署站需重新封裝發布。

## 檢查

執行 `npm test` 驗證價格、快取與 API 存取保護；執行 `npm run build` 封裝部署檔案。

目前沒有會員、公開投稿、跨裝置同步、歷史價格與全商店匯入。價格受地區、時間與 Steam 端狀況影響，購買以 Steam 結帳頁為準。
