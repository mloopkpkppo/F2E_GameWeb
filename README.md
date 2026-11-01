# PIXEL QUEST｜遊戲探索基地

## 程式排版

原始碼採用 2 個空白縮排、分行標籤與分行樣式規則。安裝開發工具後，可使用以下指令維持團隊一致的格式：

```text
npm install
npm run format
npm run format:check
```

`npm run format` 會整理排版，`npm run format:check` 只檢查。格式由 `.prettierrc.json`、`.editorconfig` 與 `.gitattributes` 統一設定；`dist/` 是自動產生的部署檔案，不用手動修改。

繁體中文像素遊戲介紹網站。使用原生 HTML、CSS、JavaScript 與 Node.js 內建模組。遊戲精選使用資料檔；Steam 登入使用內建 SQLite 保存短期驗證紀錄，不需另外安裝資料庫服務。

## 啟動

需安裝 Node.js 22.13 以上版本（建議 Node.js 24 LTS）。在這個資料夾開啟終端機，執行 `npm start`，再開啟 http://localhost:3000 。也可以雙擊「啟動網站.cmd」。按 Ctrl+C 停止伺服器。

請透過本機伺服器使用；直接雙擊 index.html 或只有靜態檔案的 Live Server 無法執行 Steam 後端串接。

## 資料夾

- index.html：首頁與精選遊戲。
- games.html：所有遊戲、搜尋與篩選。
- indie.html：獨立與個人開發遊戲。
- deals.html：特價優惠。
- community.html：玩家評價。
- account.html：Steam 登入、個人資料與遊戲庫。
- css/style.css：全站樣式、手機版排版。
- images/：本地遊戲封面、原創像素主視覺與圖示。
- js/app.js：前端搜尋、篩選、排序、收藏、試用留言。
- js/catalog.js：精選名單、繁中介紹與獨立／個人開發標籤。
- js/api.mjs：Steam 串接、價格處理、快取與錯誤處理。
- js/server.mjs：本機預覽伺服器。
- js/download-assets.mjs：依精選名單下載封面。
- js/api.test.mjs：資料處理與 API 保護測試。
- js/build.mjs：部署封裝程式。
- .openai/hosting.json：線上網站設定，無金鑰。
- dist/：執行 npm run build 產生的部署檔案，不用直接編輯。

## 分頁網址與分工

每個主要介面保留獨立 HTML 檔案供分工編輯，共用 css/style.css、js/app.js 和圖片。一般站內選單由 js/navigation.js 在同一個頁面中切換主要內容，以 0.5 秒左右滑動呈現，不會重新載入整份網頁。導覽列與頁尾位於各頁 HTML，調整共用選單時請同步各頁。

網址仍使用 /games、/indie、/deals 等路徑，可直接開啟、重新整理和返回上一個介面。Steam 登入、登出與外部連結維持正常導向。啟用系統的「減少動態效果」時會直接切換內容。

| 網址       | HTML 檔案      |
| ---------- | -------------- |
| /          | index.html     |
| /games     | games.html     |
| /indie     | indie.html     |
| /deals     | deals.html     |
| /community | community.html |
| /account   | account.html   |

透過 npm start 或正式網站開啟這些路徑，直接輸入網址及重新整理都可使用。舊的 /#indie、/#deals 等書籤會轉到新頁面；收藏清單位於 /games?filter=saved。

Steam 登入成功、取消、失敗及登出都會回到 /account。完整遊戲庫仍只在主動讀取時取得；為了跨頁標示已擁有的遊戲，僅把帳號對應的遊戲編號暫存於 sessionStorage，使用前重新驗證登入身分，登出時清除。這不會同步收藏或留言到其他裝置。

## 第一版功能

收錄 24 款 Steam 作品，包含 18 款獨立遊戲、其中 3 款個人開發起家的作品。提供搜尋、類型與分類篩選、價格與折扣排序、收藏、遊戲介紹視窗、截圖、發售日、在線人數、評價比例及 Steam 評論。

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

目前支援選擇性的 Steam 身分登入，沒有公開投稿、跨裝置同步、歷史價格與全商店匯入。價格受地區、時間與 Steam 端狀況影響，購買以 Steam 結帳頁為準。

## 網頁小遊戲收錄

`/minigames` 收錄可直接在瀏覽器開啟的遊戲，資料維護於 `js/minigames.js`，封面放在 `images/mini-*`。目前人工確認原站連結與玩法，不自動抓取 Threads。新增作品時，填寫原名、作者、分類、介面語言、操作方式及原站網址；圖片使用原站分享圖並標示來源。遊戲於新分頁開啟，不嵌入或複製遊戲程式。

## Steam 登入設定（可設定版本）

瀏覽網站不需要登入。Steam 登入使用官方 OpenID，不會在本站輸入 Steam 密碼；OpenID 身分驗證本身不需要 Web API Key。

本機步驟：

1. 需要 Node.js 22.13 或以上版本（建議 Node.js 24 LTS）。
2. 將 `.env.example` 複製成 `.env`。
3. 申請一般 Steam Web API Key：https://steamcommunity.com/dev/apikey 。將金鑰填入 `.env` 的 `STEAM_API_KEY=` 後方；不要加進 app.js 或 index.html，也不要提交 Git。
4. 本機維持 `SITE_ORIGIN=http://localhost:3000`，再執行 `npm start`。請使用這個網址登入，不要改成 127.0.0.1，因為回呼和登入 Cookie 必須使用同一來源。
5. 若更換 PORT，SITE_ORIGIN 也須對應。例如兩者分別設為 3001、http://localhost:3001。
6. 修改金鑰後，重新啟動伺服器。

`.env` 尚未填入金鑰時，仍可進行 Steam 身分驗證並顯示 SteamID，但暱稱、頭像與遊戲庫會明確顯示等待管理者設定。設定金鑰後不需修改前端。

`SESSION_SECRET` 是本站用來保護登入 Cookie 的另一個隨機祕密，不是 Steam API Key。本機省略時每次啟動產生新值，重啟後需重新登入；正式環境必須設定固定且至少 32 字元的高強度隨機值。

正式環境透過主機的機密環境變數設定 `STEAM_API_KEY`、`SESSION_SECRET`，以及非機密的 `SITE_ORIGIN`。本機 .env 不會隨部署上傳；線上金鑰須另外設定。登入與使用者資料端點使用 no-store，不進入公開遊戲快取。

新增檔案：

- js/steam-auth.mjs：OpenID 回呼、簽章 Cookie、個人資料和遊戲庫端點。
- js/steam-auth.test.mjs：登入與隱私保護測試。
- js/migrations/0001_steam_login.sql：一次性登入回呼識別碼的資料表。
- .env.example：可填寫設定的範本，沒有真實金鑰。

本機只會在 `.local/auth.sqlite` 保存短期隨機登入識別碼，用來阻擋重複回呼；不保存 Steam 密碼、個人檔案或遊戲庫。線上對應使用 D1 的 DB binding。有效的登入 Cookie 最長 8 小時，Secure（線上）、HttpOnly、SameSite=Lax，且不能用前端自行填入 SteamID 偽裝成會員。

遊戲庫需由登入玩家主動點擊讀取。私人遊戲庫或未回傳資料會呈現無法取得，不會解讀為零款遊戲。收藏與試用留言仍是本機瀏覽器功能；本版沒有跨裝置會員收藏或公開會員留言。

測試中的 Steam 正面驗證、個人資料和遊戲庫回應使用模擬資料，不會用開發者或訪客的帳號自動登入。真實資料讀取仍需管理者金鑰，以及使用者在 Steam 官方頁面完成登入。
