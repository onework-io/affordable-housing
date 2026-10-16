# 可負擔住宅三維圖台 PoC

驗證提案中風險最高的幾件事：BIM 模型能否放上網頁圖台、能否點到樓層、生活圈畫圈查詢、房源與 720 環景的串接流程。
**所有社區、房源、設施都是示範資料；3D 模型是 HK 專案的雙塔替代模型，不是本案建物。**

## 啟動

```sh
cd poc-web
npm install
npm run dev        # http://localhost:5180
```

正式建置：`npm run build`，輸出在 `dist/`，任何靜態伺服器都能放。

## 底圖與 3D 城市

| 圖層 | 來源 | 備註 |
|---|---|---|
| 電子地圖（預設） | 內政部國土測繪中心 WMTS `EMAP` | 免金鑰、可跨網域，zoom 0–19 |
| 正射影像 | 內政部國土測繪中心 WMTS `PHOTO2` | 左上角切換 |
| 桃園市 3D 建物（預設） | 桃園市地政局 MVT `H_Build`（內政部 111 年三維建物 LOD1，`BUILD_H` 高度） | 3D 模式、zoom ≥ 16；左上可開關 |
| 社區範圍 | 桃園市地政局 MVT `Community`（名稱、戶數、樓層、用途），點擊看資料 | zoom ≥ 16 |
| 地籍圖 | 國土測繪中心 WMTS `LANDSECT` | 預設關閉，zoom ≥ 15 |
| 3D 白模城市（補充） | OpenFreeMap 向量圖磚（OSM 建物 `render_height`） | zoom 14–16 遠景；桃園市圖層關閉時全程使用 |
| 3D Tiles（選用） | `.env.local` 設 `VITE_3DTILES_URL`（tileset.json）或 `VITE_GOOGLE_3DTILES_KEY` | 設定後取代白模城市 |

網址格式 `https://wmts.nlsc.gov.tw/wmts/<圖層>/default/GoogleMapsCompatible/{z}/{y}/{x}`（注意是 z/y/x）。

桃園市圖層來自 `https://tylandgis.tycg.gov.tw/TaoyuanMVT/<圖層>/{z}/{x}/{y}.pbf`（桃寶網 3D 使用的服務，只有 zoom 16）。
**這不是公開 API，正式使用前須向桃園市政府地政局申請**；因此只在連網的本機版線上讀取，不打包進展示版。
同一服務另有 `Taoyuan_PropertyRight`（分戶產權面，含起始高度與樓層高，可做戶別 3D 高亮）與 `Taoyuan_BuildingPoint`，含門牌、建號、交易價格，待授權確認後再評估使用。
要關閉桃園市圖層：`.env.local` 設 `VITE_TAOYUAN_MVT=off`。
Leaflet 也是讀同一組圖磚；這裡用 MapLibre，才能在同一個地圖上做 2D 與 3D。
圖磚需連網；個別圖磚失敗只會在 console 留警告，資料圖層照常顯示。

### 離線／展示版底圖（打包圖磚）

`public/tiles/` 已有桃園範圍的國土測繪中心圖磚（電子地圖 z10–17、正射影像 z10–16，共 1,298 張，以 base64 JSON 依縮放分檔）。
範圍定義在 `scripts/tile-plan.mjs`：低縮放涵蓋桃園北區，z16–17 只涵蓋示範社區周邊。更新圖磚：`npm run tiles:fetch`（需連網）。

`npm run build:artifact`（`--mode artifact`，見 `.env.artifact`）會改讀這批打包圖磚（自訂協定 `packed://`），
並把 GLB／EXR 包成 JSON，適合發佈到不允許外部連線的環境；這個版本沒有 OSM 白模城市。

## 已做到

- **2D／3D 同一個地圖實例**（MapLibre + deck.gl，沿用 TaiwanWarRoom03 架構），切換時選取、生活圈、篩選都保留
- **白模城市**：向量底圖建物輪廓擠出（3D 模式、zoom ≥ 13）
- **BIM 分層模型**：每層一個 instance，可點單一樓層 → 右側列出該層戶別；選戶別 → 該樓層亮橘色、其他樓層半透明
- **無模型社區**：以量體示意，選戶別時以樓層切片標示
- **自訂生活圈**：起點可選社區或「地圖指定位置」，步行／開車 × 5–30 分鐘，半徑 = 速度 × 時間；圈內住宅、設施即時統計
- **房源流程**：社區基本資料 → 銷售中房源 → 戶別詳細 → 720 環景（缺素材顯示「尚未提供」）

## 結構

```
poc-web/
  scripts/prepare-model.mjs   GLB 前處理：解 Draco、白模材質、減面、標準層共用（instancing）
  public/models/hk/           前處理後的 9 個 GLB + manifest.json（65 層，11.6 MB）
  public/pano/demo.exr        示範環景（HK 專案 HDRI，非本戶實景）
  src/config/                 底圖、生活圈參數（速度、時間範圍、設施分類）
  src/data/                   示範社區、房源、設施（固定亂數種子）
  src/services/api.ts         資料存取層 —— 正式版換成後端 API，UI 不用改
  src/store/useAppStore.ts    共用狀態（Zustand）
  src/components/             MapView、buildLayers、LeftPanel、RightPanel、PanoramaModal
assets-src/
  hk-parts/                   從 HK 專案複製的原始分層 GLB（不含 52 MB 的 landscape）
  pano/                       原始 HDRI
```

## 模型前處理

```sh
npm run model:prepare                       # 預設：減面 0.2、誤差 0.01
node scripts/prepare-model.mjs <輸入> <輸出> 0.3 0.005   # 自訂減面比例與誤差
```

幾何相同的樓層（標準層）只輸出一個 GLB，前端以 `offsetY` 疊出整棟：T1 29 層、T2 29 層各共用一個檔。
換成正式 BIM 時，只要每層拆成一個 GLB、命名 `<棟>_<樓層>F.glb`，同一支腳本可直接用。

## 模型定位（對應後台「住宅與建物管理」）

`src/data/communities.ts` 每個社區的 `model`：`anchor`（模型原點經緯度）、`yaw`（旋轉）、`altitude`（高程）。
目前錨點是示意位置。正式版由後台維護，並記錄需要隱藏的白模 footprint。

## 已知限制

- 白模城市沒有挖空：放 BIM 的位置若底圖剛好有建物輪廓，會重疊
- 模型只拆到「層」，戶別層級高亮要等正式 BIM 有 IfcSpace
- 2F 裙樓檔仍有 4.8 MB；下一步可加 meshopt 壓縮（預估全部降到 2–3 MB）
- 720 正式版為外連既有平台，這裡內嵌示範環景只為驗證流程
