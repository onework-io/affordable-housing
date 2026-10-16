// 線上賞屋（720 環景）視窗：嵌入外部 VR 導覽，並提供另開分頁的備用入口。
// 第三方網站可能禁止被嵌入，或要求先同意其使用須知；畫面空白時請改用「在新分頁開啟」。
import { selectedCommunity, useAppStore } from '@/store/useAppStore'
import { DEMO_VR } from '@/config/vr'

export function PanoramaModal() {
  const s = useAppStore()
  const unit = s.units.find((u) => u.id === s.panoUnitId) ?? null
  const c = selectedCommunity(s)
  if (!unit?.panoUrl) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 p-6" data-testid="pano-modal">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-white">
        <div>
          <span className="mr-2 rounded bg-brand px-2 py-0.5 text-sm font-bold">線上賞屋</span>
          <span className="text-lg font-semibold">
            {c?.name} · {unit.label}
          </span>
        </div>
        <div className="flex gap-2">
          <a className="btn-ghost" href={unit.panoUrl} target="_blank" rel="noopener noreferrer">
            在新分頁開啟 ↗
          </a>
          <button className="btn-ghost" onClick={() => s.openPano(null)}>
            關閉
          </button>
        </div>
      </div>
      <div className="relative flex-1 overflow-hidden rounded-xl bg-slate-900">
        <iframe
          title={`${unit.label} 線上賞屋`}
          src={unit.panoUrl}
          className="h-full w-full border-0"
          allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/60 px-2 py-1 text-xs text-white">
          示範：{DEMO_VR.provider}（非本戶實景）· 畫面空白時請按「在新分頁開啟」
        </div>
      </div>
    </div>
  )
}
