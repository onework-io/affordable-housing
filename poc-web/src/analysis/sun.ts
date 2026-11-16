// 太陽位置（NOAA 簡化公式，誤差約 0.5° 內，足夠日照分析使用）
const rad = Math.PI / 180

/** 方位角（度，正北順時針）與高度角（度） */
export function sunPosition(date: Date, lat: number, lng: number): { azimuth: number; elevation: number } {
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0
  const L = (280.46 + 0.9856474 * n) % 360
  const g = (357.528 + 0.9856003 * n) * rad
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad
  const eps = (23.439 - 0.0000004 * n) * rad
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda))
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda))
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24
  const ha = (gmst * 15 + lng) * rad - ra
  const phi = lat * rad
  const el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha))
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha))
  return { azimuth: ((az / rad) % 360 + 360) % 360, elevation: el / rad }
}

/** 臺灣時間（UTC+8）的某日某時 */
export function taipeiTime(dateStr: string, hours: number): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const h = Math.floor(hours)
  const min = Math.round((hours - h) * 60)
  return new Date(Date.UTC(y, m - 1, d, h - 8, min))
}

export const fmtClock = (hours: number) => `${String(Math.floor(hours)).padStart(2, '0')}:${String(Math.round((hours % 1) * 60)).padStart(2, '0')}`
