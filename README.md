# 桃園市可負擔住宅三維圖台

以 2D／3D 圖台呈現可負擔住宅、自訂生活圈、房源與 720 環景看屋，並提供後台管理的技術驗證（PoC）。

**線上展示：https://onework-io.github.io/affordable-housing/**（帳號 `admin`／密碼 `admin123`）

推上 `main` 後由 GitHub Actions（`.github/workflows/pages.yml`）自動編譯並發佈。

## 目錄

| 路徑 | 內容 |
|---|---|
| `poc-web/` | 前台圖台＋後台管理（React・TypeScript・Vite・MapLibre GL・deck.gl・three.js），說明見 `poc-web/README.md` |
| `poc-web/scripts/` | 模型前處理、圖磚打包、公車站牌／路線、視野分析高度圖（DSM）產生程式 |
| `assets-src/` | 原始 3D 分層模型（HK 專案替代模型）、公車開放資料原檔 |
| `taoyuan-*.json` | 下載的原始圖磚（國土測繪中心、桃園市地政局 MVT） |
| `簡報/` | PoC 功能介紹簡報與各功能操作錄影 |

## 快速開始

```bash
cd poc-web
npm install
npm run dev          # http://localhost:5180
npm run build:pages      # GitHub Pages 版（輸出 dist-pages）
npm run build:artifact   # 單頁展示版（圖磚、模型打包）
```

登入：示範帳號 `admin` / `admin123`（前端示範用，正式版需改為後端驗證）。

## 資料來源與授權

- 電子地圖、正射影像：內政部國土測繪中心 WMTS（政府資料開放授權）
- 3D 建物、社區範圍：桃園市政府地政局 MVT（**非公開服務，正式使用前須取得授權**）
- OSM 建物、公車站牌位置：© OpenStreetMap 貢獻者（ODbL）
- 公車路線站序：mattlin4567/Taoyuan-bus-opendata（MIT；桃園市公車動態資訊系統 2017）
