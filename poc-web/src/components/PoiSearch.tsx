// 左側：生活圈 POI 搜尋（餐廳、景點、博物館、住宿、其他消費）
import { useEffect, useState } from 'react'
import { POI_CAT, POI_CAT_KEYS } from '@/config/poi'
import { useAppStore } from '@/store/useAppStore'
import { fmtKm } from '@/utils/geo'

const SUGGEST = ['拉麵', '火鍋', '咖啡', '早餐', '日式', '民宿', '古蹟', '伴手禮']

export function PoiSearch() {
  const s = useAppStore()
  const [text, setText] = useState(s.poiQ)
  const [limit, setLimit] = useState(30)
  // 輸入停頓 250 ms 再查詢
  useEffect(() => {
    const id = setTimeout(() => text !== useAppStore.getState().poiQ && s.setPoiQ(text), 250)
    return () => clearTimeout(id)
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setLimit(30), [s.poiHits])
  const count = (c: keyof typeof POI_CAT) => s.poiAll.filter((p) => p.cat === c).length
  const allOn = s.poiCats.size === POI_CAT_KEYS.length

  return (
    <section className="panel space-y-2 p-4" data-testid="poi-search">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-bold">生活圈 POI 搜尋</h3>
        <label className="flex cursor-pointer items-center gap-1 text-xs text-ink-muted">
          <input type="checkbox" className="accent-brand" data-testid="poi-show" checked={s.showPoi} onChange={(e) => s.setShowPoi(e.target.checked)} />
          地圖顯示
        </label>
      </div>
      {!s.poiReady ? (
        <p className="text-xs text-ink-muted">{s.poiError ?? 'POI 資料庫載入中…'}</p>
      ) : (
        <>
          <div className="relative">
            <input
              type="search"
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-brand"
              placeholder="名稱、料理、地址，例：拉麵、民宿、中壢區"
              value={text}
              data-testid="poi-q"
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {SUGGEST.map((w) => (
              <button key={w} className={`rounded-full border px-2 py-0.5 text-[11px] ${s.poiQ === w ? 'border-brand bg-brand text-white' : 'border-slate-200 text-ink-muted hover:border-brand-line'}`} onClick={() => setText(s.poiQ === w ? '' : w)}>
                {w}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1" data-testid="poi-cats">
            <button className={`rounded-md border px-1.5 py-0.5 text-[11px] ${allOn ? 'border-ink bg-ink text-white' : 'border-slate-200 hover:bg-brand-soft'}`} onClick={() => POI_CAT_KEYS.forEach((c) => !s.poiCats.has(c) && s.togglePoiCat(c))}>
              全部 {s.poiAll.length}
            </button>
            {POI_CAT_KEYS.map((c) => {
              const on = s.poiCats.has(c)
              return (
                <button
                  key={c}
                  data-testid={`poi-cat-${c}`}
                  title="點選切換；雙擊只看此類"
                  className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] ${on ? 'border-slate-300 bg-white' : 'border-slate-100 text-ink-faint line-through'}`}
                  onClick={() => s.togglePoiCat(c)}
                  onDoubleClick={() => s.togglePoiCat(c, true)}
                >
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: `rgb(${POI_CAT[c].color.join(',')})`, opacity: on ? 1 : 0.35 }} />
                  {POI_CAT[c].label} {count(c)}
                </button>
              )
            })}
          </div>
          <div className="text-[11px] text-ink-muted" data-testid="poi-count">
            {s.query ? <>以「{s.query.centerLabel}」為中心、半徑 {fmtKm(s.query.radiusKm)}：共 <b className="text-ink">{s.poiHits.length}</b> 筆{s.poiQ && <>符合「{s.poiQ}」</>}</> : '先設定生活圈'}
          </div>
          <ul className="max-h-72 space-y-0.5 overflow-y-auto" data-testid="poi-list">
            {s.poiHits.slice(0, limit).map((p) => (
              <li key={p.id}>
                <button
                  className={`flex w-full items-start gap-2 rounded-lg px-2 py-1 text-left hover:bg-brand-soft ${s.poiSel?.id === p.id ? 'bg-brand-soft ring-1 ring-brand-line' : ''}`}
                  onClick={() => s.selectPoi(s.poiSel?.id === p.id ? null : p.id)}
                >
                  <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `rgb(${POI_CAT[p.cat].color.join(',')})` }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block truncate text-[11px] text-ink-muted">
                      {POI_CAT[p.cat].label}
                      {p.cuisine && ` · ${p.cuisine}`}
                      {p.district && ` · ${p.district}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-ink-muted">{fmtKm(p.distanceKm)}</span>
                </button>
              </li>
            ))}
          </ul>
          {s.poiHits.length > limit && (
            <button className="btn-ghost w-full py-1 text-xs" onClick={() => setLimit(limit + 30)}>再顯示 {Math.min(30, s.poiHits.length - limit)} 筆（共 {s.poiHits.length}）</button>
          )}
          {s.query && s.poiHits.length === 0 && <p className="text-xs text-ink-muted">圈內沒有符合的 POI，可換關鍵字或加長時間。</p>}
          <p className="text-[10px] leading-snug text-ink-faint">
            資料庫 {s.poiMeta?.count.toLocaleString()} 筆（{s.poiMeta?.built}）。{s.poiMeta?.license}
          </p>
        </>
      )}
    </section>
  )
}
