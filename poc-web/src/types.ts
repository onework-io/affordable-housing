export type LngLat = [number, number]

export type TravelMode = 'walk' | 'drive'
export type FacilityCategory = 'medical' | 'shopping' | 'school' | 'park' | 'transit' | 'public'
export type UnitStatus = 'on-sale' | 'reserved' | 'sold'
export type ViewMode = '2d' | '3d'

/** BIM/GLB 模型對應（後台「住宅與建物管理」維護的欄位） */
export interface ModelPlacement {
  manifestUrl: string
  baseUrl: string
  anchor: LngLat // 模型局部原點對應的經緯度
  yaw: number // 旋轉角（度，順時針）
  altitude: number // 底部高程（公尺）
  status: 'confirmed' | 'pending'
  source: string
}

/** 無 BIM 模型時的示意量體 */
export interface Massing {
  footprint: LngLat[]
  floorHeight: number
}

export interface Tower {
  id: string // 與模型 manifest 的 tower 對應，例如 T1
  label: string // 例如 A 棟
  fromFloor: number
  toFloor: number
  unitCodes: string[] // 每層戶別代號
}

export interface Community {
  id: string
  name: string
  district: string
  address: string
  lngLat: LngLat
  floorsAbove: number
  floorsBelow: number
  siteArea: number // 平方公尺
  towers: Tower[]
  model?: ModelPlacement
  massing?: Massing
  dataDate: string
  note?: string
  demoOnSale?: number // 示範：後台新增社區時指定的銷售中戶數
}

export interface Unit {
  id: string
  communityId: string
  tower: string
  level: number
  code: string
  label: string // 例如 A 棟 12F-A1
  layout: string
  area: number // 坪（含公設）
  indoorArea: number // 坪
  price: number | null // 萬元；null = 待公告
  status: UnitStatus
  panoUrl: string | null // null = 尚未提供環景
}

export interface Facility {
  id: string
  category: FacilityCategory
  name: string
  lngLat: LngLat
}

export interface LifeCircleQuery {
  center: LngLat
  centerLabel: string
  mode: TravelMode
  minutes: number
  radiusKm: number
}

export interface LifeCircleResult {
  facilities: (Facility & { distanceKm: number })[]
  communities: { id: string; distanceKm: number }[]
}

/** 模型 manifest（scripts/prepare-model.mjs 產生） */
export interface ModelManifest {
  source: string
  meshes: { id: string; file: string; bytes: number; tris: number; usedBy: number }[]
  floors: { id: string; tower: string; floor: string; level: number; mesh: string; offsetY: number; minY: number; maxY: number }[]
  totalBytes: number
}

/** 公車站牌（位置：OpenStreetMap；經過路線：桃園市公車動態資訊系統 2017 資料） */
export interface BusRoute { code: string; from: string; to: string }
export interface BusStop { id: string; name: string; lngLat: LngLat; routes: BusRoute[] }
