// 線上賞屋（720 環景）彈出視窗：以 iframe 嵌入外部 VR 導覽，不用跳頁。
// 支援全螢幕、Esc／點背景關閉；外部網站若禁止嵌入，可改按「在新分頁開啟」。
import { useEffect, useRef, useState } from 'react'
import { selectedCommunity, useAppStore } from '@/store/useAppStore'
import { DEMO_VR } from '@/config/vr'

export function PanoramaModal() {
  const s = useAppStore()
  const unit = s.units.find((u) => u.id === s.panoUnitId) ?? null
  const c = selectedCommunity(s)
  const frameBox = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (!unit) return
    setLoaded(false)
    setSlow(false)
    const t = setTimeout(() => setSlow(true), 12000)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.fullscreenElement && s.openPano(null)
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit?.id])

  if (!unit?.panoUrl) return null
  const price = unit.price ? `${unit.price.toLocaleString()} 萬` : '待公告'
  const fullscreen = () => frameBox.current?.requestFullscreen?.().catch(() => {})

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/60 p-4 backdrop-blur-sm sm:p-8" data-testid="pano-modal" onClick={() => s.openPano(null)} role="dialog" aria-modal="true" aria-label="線上賞屋">
      <div className="flex h-full max-h-[860px] w-full max-w-[1280px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded bg-brand px-2 py-0.5 text-xs font-bold text-white">線上賞屋 720°</span>
              <span className="truncate text-base font-bold text-ink">
                {c?.name} · {unit.label}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-ink-muted">
              <span className="chip bg-slate-100">{unit.layout}</span>
              <span className="chip bg-slate-100">{unit.area} 坪</span>
              <span className="chip bg-slate-100">總價 {price}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-ghost py-1.5 text-xs" onClick={fullscreen} data-testid="pano-fullscreen">
              ⛶ 全螢幕
            </button>
            <a className="btn-ghost py-1.5 text-xs" href={unit.panoUrl} target="_blank" rel="noopener noreferrer">
              新分頁開啟 ↗
            </a>
            <button className="grid h-9 w-9 place-items-center rounded-lg text-2xl leading-none text-ink-faint hover:bg-slate-100 hover:text-ink" onClick={() => s.openPano(null)} aria-label="關閉" data-testid="pano-close">
              ×
            </button>
          </div>
        </div>
        <div ref={frameBox} className="relative min-h-0 flex-1 bg-slate-900">
          <iframe
            key={unit.id}
            title={`${unit.label} 線上賞屋`}
            src={unit.panoUrl}
            className="h-full w-full border-0"
            allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            onLoad={() => setLoaded(true)}
          />
          {!loaded && (
            <div className="absolute inset-0 grid place-items-center text-sm text-white/80">
              <div className="flex flex-col items-center gap-3">
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                載入 720 環景…
                {slow && <span className="text-xs text-white/60">載入較久，可改按右上「新分頁開啟」</span>}
              </div>
            </div>
          )}
          <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/55 px-2 py-1 text-[11px] text-white">
            示範：{DEMO_VR.provider}（非本戶實景）・拖曳環視・Esc 關閉
          </div>
        </div>
      </div>
    </div>
  )
}
