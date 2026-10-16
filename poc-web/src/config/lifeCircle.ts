import type { FacilityCategory, TravelMode } from '@/types'
import { useAdminStore } from '@/admin/adminStore'

// 生活圈參數（對應後台「生活圈參數」）。
// 本期採距離圈選：半徑 = 速度 × 時間，不代表實際步行或通勤可達時間。
// 速度、預設時間與時間範圍由後台「生活圈參數」維護
export const MODE_LABEL: Record<TravelMode, string> = { walk: '步行', drive: '開車' }
export const speedKmh = (mode: TravelMode) => useAdminStore.getState().lifeCircle[mode]
export const minuteRange = () => {
  const p = useAdminStore.getState().lifeCircle
  return { min: p.min, max: p.max, step: p.step }
}
export const defaultMinutes = () => useAdminStore.getState().lifeCircle.defaultMinutes

export const radiusKm = (mode: TravelMode, minutes: number) => (speedKmh(mode) * minutes) / 60

export const CATEGORY: Record<FacilityCategory, { label: string; glyph: string; color: [number, number, number] }> = {
  medical: { label: '醫療', glyph: '醫', color: [220, 38, 38] },
  shopping: { label: '商業', glyph: '商', color: [234, 140, 0] },
  school: { label: '學校', glyph: '學', color: [37, 99, 235] },
  park: { label: '公園綠地', glyph: '園', color: [101, 163, 13] },
  transit: { label: '交通設施', glyph: '交', color: [30, 64, 175] },
  public: { label: '公共設施', glyph: '公', color: [100, 116, 139] },
}
export const CATEGORY_KEYS = Object.keys(CATEGORY) as FacilityCategory[]
