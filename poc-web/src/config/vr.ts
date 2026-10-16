// 線上賞屋（720 環景）示範連結
// 正式版：每一戶對應既有 720 環景平台的連結，由後台「環景連結管理」維護。
// PoC：所有有環景的戶別都先指向同一個外部 720 環景（AIHouse），非本戶實景。
export const DEMO_VR = {
  url: 'https://www.aihouse.com/720/S114961257?lang=zh-TW',
  provider: 'AIHouse 720 環景（特力屋 鄉村臥房）',
}

/** 是否嘗試以 iframe 嵌入（發佈環境不允許嵌入外部網站時以 VITE_EMBED_VR=off 關閉，改為另開分頁） */
export const EMBED_VR = import.meta.env.VITE_EMBED_VR !== 'off'

/** 線上賞屋可切換的示範場景：720 環景＋3D 實景（高斯潑濺 Gaussian Splatting，SuperSplat 檢視器） */
export interface Tour { id: string; kind: '720' | '3dgs'; label: string; provider: string; url: string }
export const SPLAT_TOURS: Tour[] = [
  { id: 'splat-a', kind: '3dgs', label: '3D 實景 A', provider: 'SuperSplat 高斯潑濺', url: 'https://superspl.at/s?id=13b9a601' },
  { id: 'splat-b', kind: '3dgs', label: '3D 實景 B', provider: 'SuperSplat 高斯潑濺', url: 'https://superspl.at/s?id=c5a4b7c2' },
  { id: 'splat-c', kind: '3dgs', label: '3D 實景 C', provider: 'SuperSplat 高斯潑濺', url: 'https://superspl.at/s?id=7f8d0256' },
]
/** 某一戶可看的場景：該戶的 720 環景在前，其後為 3D 實景示範 */
export function toursFor(panoUrl: string | null): Tour[] {
  const own: Tour[] = panoUrl ? [{ id: 'pano', kind: '720', label: '720 環景', provider: DEMO_VR.provider, url: panoUrl }] : []
  return [...own, ...SPLAT_TOURS]
}
