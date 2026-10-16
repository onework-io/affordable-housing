import type { StyleSpecification } from 'maplibre-gl'

// ── 底圖：內政部國土測繪中心 WMTS（GoogleMapsCompatible，網址順序 z/y/x，免金鑰，可跨網域）
//   EMAP  = 臺灣通用電子地圖；PHOTO2 = 正射影像。兩者實測到 zoom 19 都有圖磚。
// ── 3D 白模城市：OpenFreeMap 向量圖磚（OpenMapTiles schema，OSM 建物 render_height）擠出
// ── 3D Tiles（選用）：VITE_3DTILES_URL 指向 tileset.json，或 VITE_GOOGLE_3DTILES_KEY 載入 Google 寫實 3D
// Leaflet 讀的也是同一組 XYZ／WMTS 圖磚；這裡用 MapLibre 是為了同一個地圖同時做 2D 與 3D。

export type BasemapId = 'emap' | 'photo'

const nlsc = (layer: string) => `https://wmts.nlsc.gov.tw/wmts/${layer}/default/GoogleMapsCompatible/{z}/{y}/{x}`
const NLSC_ATTR = '<a href="https://maps.nlsc.gov.tw/" target="_blank" rel="noopener">© 內政部國土測繪中心</a>'

export const BASEMAPS: Record<BasemapId, { label: string; tiles: string[] }> = {
  emap: { label: '電子地圖', tiles: [nlsc('EMAP')] },
  photo: { label: '正射影像', tiles: [nlsc('PHOTO2')] },
}

/** 白模城市來源（OSM 建物） */
export const OSM_BUILDINGS_TILEJSON = 'https://tiles.openfreemap.org/planet'

/** 是否顯示底圖。VITE_BASEMAP=none 時只有背景色 */
export const USE_BASEMAP = import.meta.env.VITE_BASEMAP !== 'none'

/**
 * 圖磚來源：online = 直接讀國土測繪中心；packed = 讀預先打包的 public/tiles（npm run tiles:fetch），
 * 用在不能連外部網址的展示環境。OSM 白模城市也打包（public/tiles/osm/z14.json），範圍較小。
 */
export const PACKED_TILES = import.meta.env.VITE_TILES === 'packed'
const PACKED_MAXZOOM: Record<BasemapId, number> = { emap: 17, photo: 16 }
const PACKED_BOUNDS: [number, number, number, number] = [121.05, 24.9, 121.45, 25.18]
// 打包的 OSM 建物（OpenFreeMap z14 向量圖磚）範圍
const PACKED_OSM_BOUNDS: [number, number, number, number] = [121.24, 24.94, 121.36, 25.03]
// 打包的桃園市 3D 建物／社區範圍（zoom 16）範圍
const PACKED_TY_BOUNDS: [number, number, number, number] = [121.28, 24.975, 121.32, 25.01]
const OSM_ATTR =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">© OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'

// ── 桃園市地政局向量圖磚（桃寶網 3D 使用的服務；MVT，只有 zoom 16，可跨網域讀取）
//   H_Build   = 內政部 111 年度三維建物（LOD1），BUILD_H 為建物高度
//   Community = 社區範圍（名稱、戶數、樓層、用途）
//   非公開 API：正式使用前須向桃園市政府地政局申請。展示版只打包示範範圍，僅供內部展示、未經授權不得散布。
export const TY_MVT = (layer: string) => `https://tylandgis.tycg.gov.tw/TaoyuanMVT/${layer}/{z}/{x}/{y}.pbf`
const TY_ATTR = '桃園市政府地政局（三維建物：內政部）'
/** 桃園市圖層開關：VITE_TAOYUAN_MVT=off 可關閉 */
export const TY_ENABLED = USE_BASEMAP && import.meta.env.VITE_TAOYUAN_MVT !== 'off'

/** 地圖上可開關的參考圖層 */
export type OverlayId = 'tyBuildings' | 'community' | 'landsect'
export const OVERLAYS: { id: OverlayId; label: string; layers: string[]; defaultOn: boolean }[] = TY_ENABLED
  ? [
      { id: 'tyBuildings', label: '桃園市 3D 建物', layers: ['ty-buildings'], defaultOn: true },
      { id: 'community', label: '社區範圍', layers: ['ty-community-fill', 'ty-community-line'], defaultOn: true },
      ...(PACKED_TILES ? [] : [{ id: 'landsect' as const, label: '地籍圖', layers: ['overlay-landsect'], defaultOn: false }]),
    ]
  : []
/** 3D 模式才顯示的立體建物圖層 */
export const EXTRUSION_LAYERS = ['3d-buildings', 'ty-buildings']

/** 選用 3D Tiles */
export const TILESET_URL: string = import.meta.env.VITE_3DTILES_URL ?? ''
export const GOOGLE_3DTILES_KEY: string = import.meta.env.VITE_GOOGLE_3DTILES_KEY ?? ''
export const GOOGLE_3DTILES_URL = 'https://tile.googleapis.com/v1/3dtiles/root.json'
export const HAS_3DTILES = !!(TILESET_URL || GOOGLE_3DTILES_KEY)

export const BG_COLOR = '#eef1f4'

export function buildStyle(initial: BasemapId): StyleSpecification {
  if (!USE_BASEMAP)
    return { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': BG_COLOR } }] }
  return {
    version: 8,
    sources: PACKED_TILES
      ? {
          emap: { type: 'raster', tiles: ['packed://emap/{z}/{x}/{y}'], tileSize: 256, minzoom: 10, maxzoom: PACKED_MAXZOOM.emap, bounds: PACKED_BOUNDS, attribution: NLSC_ATTR },
          photo: { type: 'raster', tiles: ['packed://photo/{z}/{x}/{y}'], tileSize: 256, minzoom: 10, maxzoom: PACKED_MAXZOOM.photo, bounds: PACKED_BOUNDS, attribution: NLSC_ATTR },
          osm: { type: 'vector', tiles: ['packed://osm/{z}/{x}/{y}'], minzoom: 14, maxzoom: 14, bounds: PACKED_OSM_BOUNDS, attribution: OSM_ATTR },
          ...(TY_ENABLED
            ? {
                tyBuild: { type: 'vector' as const, tiles: ['packed://tybuild/{z}/{x}/{y}'], minzoom: 16, maxzoom: 16, bounds: PACKED_TY_BOUNDS, attribution: TY_ATTR },
                tyComm: { type: 'vector' as const, tiles: ['packed://tycomm/{z}/{x}/{y}'], minzoom: 16, maxzoom: 16, bounds: PACKED_TY_BOUNDS },
              }
            : {}),
        }
      : {
          emap: { type: 'raster', tiles: BASEMAPS.emap.tiles, tileSize: 256, maxzoom: 19, attribution: NLSC_ATTR },
          photo: { type: 'raster', tiles: BASEMAPS.photo.tiles, tileSize: 256, maxzoom: 19, attribution: NLSC_ATTR },
          osm: { type: 'vector', url: OSM_BUILDINGS_TILEJSON },
          ...(TY_ENABLED
            ? {
                tyBuild: { type: 'vector' as const, tiles: [TY_MVT('H_Build')], minzoom: 16, maxzoom: 16, bounds: [120.987026, 24.629938, 121.441428, 25.119451] as [number, number, number, number], attribution: TY_ATTR },
                tyComm: { type: 'vector' as const, tiles: [TY_MVT('Community')], minzoom: 16, maxzoom: 16, bounds: [121.025545, 24.816281, 121.410504, 25.116818] as [number, number, number, number] },
                landsect: { type: 'raster' as const, tiles: [nlsc('LANDSECT')], tileSize: 256, maxzoom: 17, attribution: NLSC_ATTR },
              }
            : {}),
        },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': BG_COLOR } },
      { id: 'basemap-emap', type: 'raster', source: 'emap', layout: { visibility: initial === 'emap' ? 'visible' : 'none' }, paint: { 'raster-saturation': -0.35, 'raster-opacity': 0.95 } },
      { id: 'basemap-photo', type: 'raster', source: 'photo', layout: { visibility: initial === 'photo' ? 'visible' : 'none' } },
      ...(TY_ENABLED
        ? ([
            ...(PACKED_TILES ? [] : [{ id: 'overlay-landsect', type: 'raster', source: 'landsect', minzoom: 15, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.85 } }]),
            { id: 'ty-community-fill', type: 'fill', source: 'tyComm', 'source-layer': 'Community', paint: { 'fill-color': '#059669', 'fill-opacity': 0.06 } },
            { id: 'ty-community-line', type: 'line', source: 'tyComm', 'source-layer': 'Community', paint: { 'line-color': '#059669', 'line-width': 1.6, 'line-opacity': 0.8 } },
          ] as StyleSpecification['layers'])
        : []),
      {
        id: '3d-buildings',
        type: 'fill-extrusion',
        source: 'osm',
        'source-layer': 'building',
        minzoom: 14,
        // 有桃園市 3D 建物時，OSM 只補 zoom 14–16 的遠景
        ...(TY_ENABLED ? { maxzoom: 16 } : {}),
        layout: { visibility: HAS_3DTILES ? 'none' : 'visible' },
        paint: {
          'fill-extrusion-color': '#f4f4f1',
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 9],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.9,
        },
      },
      ...(TY_ENABLED
        ? ([
            {
              id: 'ty-buildings',
              type: 'fill-extrusion',
              source: 'tyBuild',
              'source-layer': 'H_BUILD',
              minzoom: 16,
              layout: { visibility: HAS_3DTILES ? 'none' : 'visible' },
              paint: {
                'fill-extrusion-color': '#f4f4f1',
                'fill-extrusion-height': ['coalesce', ['to-number', ['get', 'BUILD_H']], 6],
                'fill-extrusion-opacity': 0.92,
              },
            },
          ] as StyleSpecification['layers'])
        : []),
    ],
  }
}

export const INITIAL_VIEW = { center: [121.3010, 24.9930] as [number, number], zoom: 16.1, pitch: 58, bearing: -18 }
export const VIEW_3D = { pitch: 60, bearing: -18 }
