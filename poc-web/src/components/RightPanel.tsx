// 右側：社區基本資料 → 房源（戶號）清單 → 戶別詳細內容與 720 環景
import { useEffect, useMemo, useState } from 'react'
import { RAMP_CSS } from '@/analysis/sunlight'
import { fmtClock } from '@/analysis/sun'
import { CATEGORY, CATEGORY_KEYS } from '@/config/lifeCircle'
import { selectedCommunity, selectedUnit, useAppStore } from '@/store/useAppStore'
import type { Unit } from '@/types'
import { busStats, fmtKm, haversine } from '@/utils/geo'
import { DEMO_VR, EMBED_VR } from '@/config/vr'
import { filterSummary, isFilterActive, matchUnit } from '@/config/filters'

const STATUS: Record<Unit['status'], { label: string; cls: string }> = {
  'on-sale': { label: '銷售中', cls: 'bg-brand text-white' },
  reserved: { label: '保留', cls: 'bg-amber-100 text-amber-800' },
  sold: { label: '已售', cls: 'bg-slate-100 text-slate-500' },
}
const price = (u: Unit) => (u.status === 'sold' ? '—' : u.price ? `${u.price.toLocaleString()} 萬` : '待公告')

export function RightPanel() {
  const s = useAppStore()
  const c = selectedCommunity(s)
  const unit = selectedUnit(s)

  const fActive = isFilterActive(s.filter)
  const list = useMemo(() => {
    let us = s.units.filter((u) => (fActive ? matchUnit(u, s.filter) : u.status === 'on-sale'))
    if (s.floorFilter) us = s.units.filter((u) => u.tower === s.floorFilter!.tower && u.level === s.floorFilter!.level)
    return us
  }, [s.units, s.floorFilter, s.filter, fActive])
  const inCompare = !!c && s.compareIds.includes(c.id)

  // 以此社區為中心的生活機能（與左側生活圈同一組模式／時間）
  const nearby = useMemo(() => {
    if (!c || !s.query) return null
    const r = s.query.radiusKm
    return CATEGORY_KEYS.map((cat) => ({
      cat,
      items: s.facilities.filter((f) => f.category === cat).map((f) => ({ f, d: haversine(c.lngLat, f.lngLat) })).filter((x) => x.d <= r).sort((a, b) => a.d - b.d),
    }))
  }, [c, s.facilities, s.query])

  if (!c) {
    return (
      <aside className="h-full w-[340px] shrink-0 overflow-y-auto p-3">
        <div className="panel p-5 text-sm text-ink-muted">
          <h2 className="mb-2 text-base font-bold text-ink">選取建案</h2>
          點地圖上的社區標籤、3D 建物，或左側「圈內社區」，查看基本資料與房源。
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs">
            <li>3D 模式下點建物的某一層，會列出該層戶別</li>
            <li>起點可改為「地圖指定位置」，用工作地點或學校找住宅</li>
          </ul>
        </div>
      </aside>
    )
  }

  const total = c.towers.reduce((n, t) => n + (t.toFloor - t.fromFloor + 1) * t.unitCodes.length, 0)
  const towerLabel = (id: string) => c.towers.find((t) => t.id === id)?.label ?? ''

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col gap-3 overflow-y-auto p-3" data-testid="right-panel">
      <section className="panel p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">{c.name}</h2>
            <p className="text-xs text-ink-muted">{c.address}</p>
            <button
              data-testid="add-compare"
              className={`mt-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${inCompare ? 'border-brand bg-brand text-white' : 'border-brand-line text-brand hover:bg-brand-soft'}`}
              onClick={() => s.toggleCompare(c.id)}
            >
              {inCompare ? '✓ 已加入比較' : '＋ 加入社區比較'}
            </button>
          </div>
          <button className="text-xl leading-none text-ink-faint hover:text-ink" onClick={() => s.selectCommunity(null)} aria-label="關閉">
            ×
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-brand-soft p-2 text-center">
            <div className="text-[11px] text-ink-muted">社區總戶數</div>
            <div className="text-xl font-bold text-brand">{total} 戶</div>
          </div>
          <div className="rounded-lg bg-brand-soft p-2 text-center">
            <div className="text-[11px] text-ink-muted">平台列出售中</div>
            <div className="text-xl font-bold text-rose-600">{s.onSaleCounts[c.id] ?? 0} 戶</div>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-[72px_1fr] gap-y-1 text-sm">
          <dt className="text-ink-muted">樓層</dt>
          <dd>地上 {c.floorsAbove} 層／地下 {c.floorsBelow} 層</dd>
          <dt className="text-ink-muted">基地面積</dt>
          <dd>{c.siteArea.toLocaleString()} 平方公尺</dd>
          <dt className="text-ink-muted">3D 模型</dt>
          <dd>{c.model ? <span className={`chip ${c.model.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>{c.model.status === 'confirmed' ? '已對應' : '待確認'} · {c.model.source}</span> : <span className="chip bg-amber-50 text-amber-700">待提供 · 量體示意</span>}</dd>
        </dl>
        {c.model && (
          <button
            className={`mt-3 w-full ${s.buildingViewId === c.id ? 'btn-ghost' : 'btn-primary'}`}
            data-testid="open-building"
            onClick={() => (s.buildingViewId === c.id ? s.closeBuilding() : s.openBuilding(c.id, s.floorFilter))}
          >
            {s.buildingViewId === c.id ? '← 返回圖台' : '🏢 單棟 3D 檢視'}
          </button>
        )}
        {c.note && !(c.model?.kind === 'upload' && c.note.includes('尚未')) && <p className="mt-2 rounded bg-slate-50 p-2 text-[11px] text-ink-muted">{c.note}</p>}
      </section>

      {unit ? (
        <UnitDetail unit={unit} towerLabel={towerLabel(unit.tower)} />
      ) : (
        <section className="panel p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold">
              {s.floorFilter
                ? `${towerLabel(s.floorFilter.tower)} ${s.floorFilter.level}F 全部戶別`
                : fActive
                  ? `符合條件 ${list.length} 戶（銷售中 ${s.onSaleCounts[c.id] ?? 0}）`
                  : `房源清單（銷售中 ${list.length} 戶）`}
            </h3>
            {s.floorFilter && (
              <button className="text-xs text-brand underline" onClick={() => s.setFloorFilter(null)}>
                回銷售清單
              </button>
            )}
          </div>
          {fActive && !s.floorFilter && <div className="mb-2 rounded bg-brand-soft px-2 py-1 text-[11px] text-brand">條件：{filterSummary(s.filter)}</div>}
          {fActive && !s.floorFilter && list.length === 0 && !s.unitsLoading && <p className="text-xs text-ink-muted">此社區沒有符合條件的戶別。</p>}
          {s.unitsLoading ? (
            <p className="text-xs text-ink-muted">載入中…</p>
          ) : (
            <table className="w-full text-sm" data-testid="unit-table">
              <thead>
                <tr className="text-left text-[11px] text-ink-muted">
                  <th className="py-1 font-medium">戶別</th>
                  <th className="font-medium">格局</th>
                  <th className="font-medium">建坪</th>
                  <th className="font-medium">總價</th>
                </tr>
              </thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.id} className="cursor-pointer border-t border-slate-100 hover:bg-brand-soft" onClick={() => s.selectUnit(u.id)}>
                    <td className="py-1.5">
                      <div className="font-medium">{u.label}</div>
                      <span className={`chip ${STATUS[u.status].cls}`}>{STATUS[u.status].label}</span>
                    </td>
                    <td className="text-xs">{u.layout.slice(0, 2)}</td>
                    <td className="text-xs">{u.area}</td>
                    <td className="text-xs">{price(u)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <ViewshedCard towerLabel={towerLabel} />
      <SunlightCard towerLabel={towerLabel} />

      {nearby && s.query && (
        <section className="panel p-4">
          <h3 className="mb-2 text-sm font-bold">
            {s.query.mode === 'walk' ? '步行' : '開車'} {s.query.minutes} 分鐘生活機能（半徑 {fmtKm(s.query.radiusKm)}）
          </h3>
          <ul className="space-y-1 text-sm">
            {nearby.map(({ cat, items }) => (
              <li key={cat} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: `rgb(${CATEGORY[cat].color.join(',')})` }} />
                  {CATEGORY[cat].label}
                </span>
                <span className="text-xs text-ink-muted">{items.length ? `${items.length} 處 · 最近 ${fmtKm(items[0].d)}` : '—'}</span>
              </li>
            ))}
            {(() => {
              const b = busStats(c.lngLat, s.query.radiusKm, s.busStops)
              return (
                <li className="flex items-center justify-between border-t border-slate-100 pt-1" data-testid="nearby-bus">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: 'rgb(37,99,235)' }} />
                    公車站牌
                  </span>
                  <span className="text-xs text-ink-muted">{b.stops ? `${b.stops} 站 · ${b.routes} 線 · 最近 ${fmtKm(b.nearestKm!)}` : '—'}</span>
                </li>
              )
            })()}
          </ul>
        </section>
      )}
    </aside>
  )
}

function UnitDetail({ unit, towerLabel }: { unit: Unit; towerLabel: string }) {
  const s = useAppStore()
  return (
    <section className="panel p-4" data-testid="unit-detail">
      <button className="mb-2 text-xs text-brand underline" onClick={() => s.selectUnit(null)}>
        ← 回房源清單
      </button>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">{unit.label}</h3>
        <span className={`chip ${STATUS[unit.status].cls}`}>{STATUS[unit.status].label}</span>
      </div>
      <dl className="mt-2 grid grid-cols-[72px_1fr] gap-y-1 text-sm">
        <dt className="text-ink-muted">棟別樓層</dt>
        <dd>{towerLabel || '—'} {unit.level} 樓</dd>
        <dt className="text-ink-muted">格局</dt>
        <dd>{unit.layout}</dd>
        <dt className="text-ink-muted">總面積</dt>
        <dd>{unit.area} 坪（不含車位）</dd>
        <dt className="text-ink-muted">室內面積</dt>
        <dd>{unit.indoorArea} 坪</dd>
        <dt className="text-ink-muted">總價</dt>
        <dd>{price(unit)}</dd>
      </dl>
      {unit.panoUrl ? (
        EMBED_VR ? (
          <button className="btn-primary mt-3 w-full" data-testid="open-pano" onClick={() => s.openPano(unit.id)}>
            🔄 開啟 720 環景看屋
          </button>
        ) : (
          <a className="btn-primary mt-3 w-full" data-testid="open-pano" href={unit.panoUrl} target="_blank" rel="noopener noreferrer">
            🔄 開啟 720 環景看屋 ↗
          </a>
        )
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-2 text-center text-sm text-ink-muted">720 環景尚未提供</div>
      )}
      {unit.panoUrl && <p className="mt-2 text-[11px] text-ink-faint">環景為示範連結（{DEMO_VR.provider}，非本戶實景）；視窗內另可切換 3D 實景（高斯潑濺）。</p>}
      <p className="mt-1 text-[11px] text-ink-faint">3D 已將此戶所在樓層標示為綠色；格局圖請見平台房源詳細頁。</p>
    </section>
  )
}

/** 視野分析：從選取的樓層看出去，哪些地方看得到 */
function ViewshedCard({ towerLabel }: { towerLabel: (id: string) => string }) {
  const s = useAppStore()
  const u = selectedUnit(s)
  const floor = s.floorFilter ?? (u ? { tower: u.tower, level: u.level } : null)
  const v = s.viewshed
  const fl = floor ? `${towerLabel(floor.tower)} ${floor.level > 90 ? 'RF' : `${floor.level}F`}`.trim() : ''
  return (
    <section className="panel p-4" data-testid="viewshed-card">
      <h3 className="mb-1 text-sm font-bold">🔭 視野分析</h3>
      <p className="text-[11px] leading-snug text-ink-muted">從樓層向四周拉視線（Line of Sight），被較高建物擋住的地方即為看不到的死角。</p>
      {floor ? (
        <>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span>
              觀察點：<b>{fl}</b>
            </span>
            <div className="flex overflow-hidden rounded-md border border-slate-200 text-[11px]">
              {[300, 600, 1000].map((m) => (
                <button key={m} data-testid={`vs-radius-${m}`} className={`px-1.5 py-0.5 ${s.viewshedRadius === m ? 'bg-ink text-white' : 'hover:bg-brand-soft'}`} onClick={() => s.setViewshedRadius(m)}>
                  {m >= 1000 ? `${m / 1000} km` : `${m} m`}
                </button>
              ))}
            </div>
          </div>
          <button className="btn-primary mt-2 w-full" data-testid="run-viewshed" disabled={s.viewshedBusy} onClick={() => s.runViewshed()}>
            {s.viewshedBusy ? '計算中…' : `分析 ${fl} 的視野`}
          </button>
        </>
      ) : (
        <p className="mt-2 rounded bg-slate-50 p-2 text-xs text-ink-muted">先在 3D 模型、單棟檢視或戶別清單選一個樓層。</p>
      )}
      {v && (
        <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2 text-sm" data-testid="viewshed-result">
          <div className="text-xs text-ink-muted">{v.label}・視高約 {Math.round(v.input.eyeH)} 公尺・半徑 {v.input.radiusM >= 1000 ? `${v.input.radiusM / 1000} 公里` : `${v.input.radiusM} 公尺`}</div>
          <div className="flex h-3 overflow-hidden rounded-full">
            <div style={{ width: `${v.visiblePct * 100}%`, background: 'rgb(16,185,129)' }} />
            <div className="flex-1" style={{ background: 'rgb(225,29,72)' }} />
          </div>
          <div className="flex justify-between text-xs">
            <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: 'rgb(16,185,129)' }} />可見 {(v.visiblePct * 100).toFixed(0)}%（{v.visibleHa.toFixed(1)} 公頃）</span>
            <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: 'rgb(225,29,72)' }} />遮蔽 {((1 - v.visiblePct) * 100).toFixed(0)}%</span>
          </div>
          <button className="text-xs text-brand underline" data-testid="clear-viewshed" onClick={s.clearViewshed}>
            清除視野分析
          </button>
          <p className="text-[10px] leading-snug text-ink-faint">建物高度：桃園市三維建物（4 公尺網格，地形視為平坦）；屋頂可見處也以綠色貼地顯示。僅供示意。</p>
        </div>
      )}
    </section>
  )
}

function SunlightCard({ towerLabel }: { towerLabel: (id: string) => string }) {
  const s = useAppStore()
  const c = selectedCommunity(s)
  const u = selectedUnit(s)
  const r = s.sunlight
  const p = s.sun
  const floor = s.floorFilter ?? (u ? { tower: u.tower, level: u.level } : null)
  const mode = p.mode
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    if (!playing || !r) return
    const id = setInterval(() => {
      const st = useAppStore.getState()
      const n = st.sunlight?.steps.length ?? 0
      if (n) st.setSunStep(((st.sunStep ?? -1) + 1) % n)
    }, 500)
    return () => clearInterval(id)
  }, [playing, r])
  useEffect(() => setPlaying(false), [r])
  if (!c) return null
  const y = p.date.slice(0, 4)
  const presets = [['冬至', `${y}-12-22`], ['春分', `${y}-03-21`], ['夏至', `${y}-06-21`]] as const
  const seg = 'flex overflow-hidden rounded-md border border-slate-200 text-[11px]'
  const segBtn = (on: boolean) => `px-1.5 py-0.5 ${on ? 'bg-ink text-white' : 'hover:bg-brand-soft'}`
  const step = r && s.sunStep != null ? r.steps[s.sunStep] : null
  const byTower = r?.floors ? [...new Set(r.floors.map((f) => f.tower))] : []
  return (
    <section className="panel p-4" data-testid="sunlight-card">
      <h3 className="mb-1 text-sm font-bold">☀️ 日照分析</h3>
      <p className="text-[11px] leading-snug text-ink-muted">依日期與時段逐時刻計算太陽方位與高度角，被周邊建物擋住即為陰影，累計受照時間＝日照時數。</p>
      <div className="mt-2 space-y-2 text-xs">
        <div className="flex items-center gap-1.5">
          <input type="date" className="w-32 rounded border border-slate-200 px-1.5 py-0.5" value={p.date} data-testid="sun-date" onChange={(e) => e.target.value && s.setSun({ date: e.target.value })} />
          <div className={seg}>
            {presets.map(([l, d]) => (
              <button key={l} className={segBtn(p.date === d)} data-testid={`sun-preset-${l}`} onClick={() => s.setSun({ date: d })}>{l}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-ink-muted">時段</span>
          <select className="rounded border border-slate-200 px-1 py-0.5" value={p.start} data-testid="sun-start" onChange={(e) => s.setSun({ start: +e.target.value })}>
            {[5, 6, 7, 8, 9, 10, 11].map((h) => <option key={h} value={h}>{fmtClock(h)}</option>)}
          </select>
          <span>–</span>
          <select className="rounded border border-slate-200 px-1 py-0.5" value={p.end} data-testid="sun-end" onChange={(e) => s.setSun({ end: +e.target.value })}>
            {[13, 14, 15, 16, 17, 18, 19].map((h) => <option key={h} value={h}>{fmtClock(h)}</option>)}
          </select>
          <span className="ml-auto text-ink-muted">每</span>
          <select className="rounded border border-slate-200 px-1 py-0.5" value={p.stepMin} data-testid="sun-step" onChange={(e) => s.setSun({ stepMin: +e.target.value })}>
            {[10, 15, 30, 60].map((m) => <option key={m} value={m}>{m} 分</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={seg}>
            <button className={segBtn(mode === 'scene')} data-testid="sun-mode-scene" onClick={() => s.setSun({ mode: 'scene' })}>範圍內建物＋地面</button>
            <button className={segBtn(mode === 'area')} data-testid="sun-mode-area" onClick={() => s.setSun({ mode: 'area' })}>僅地面</button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className={seg}>
            {[100, 150, 250].map((m) => <button key={m} className={segBtn(p.radiusM === m)} data-testid={`sun-radius-${m}`} onClick={() => s.setSun({ radiusM: m })}>半徑 {m} m</button>)}
          </div>
          {mode === 'area' && (
            <div className={seg}>
              <button className={segBtn(p.height === 'ground')} onClick={() => s.setSun({ height: 'ground' })}>地面</button>
              <button className={segBtn(p.height === 'floor')} disabled={!floor} title={floor ? '' : '先選樓層或戶別'} data-testid="sun-height-floor" onClick={() => s.setSun({ height: 'floor' })}>
                {floor ? `${towerLabel(floor.tower)} ${floor.level}F` : '所選樓層'}
              </button>
            </div>
          )}
        </div>
        {mode === 'scene' && <p className="text-[10px] leading-snug text-ink-muted">以本案為中心，半徑內所有建物（本案模型、平台社區、地政局三維建物）的外牆每層、屋頂與地面都切成網格逐格計算，直接在 3D 建物上著色。</p>}
      </div>
      <button className="btn-primary mt-2 w-full" data-testid="run-sunlight" disabled={s.sunBusy} onClick={() => s.runSunlight()}>
        {s.sunBusy ? '計算中…' : `分析 ${p.date.slice(5).replace('-', '/')} ${fmtClock(p.start)}–${fmtClock(p.end)} 日照`}
      </button>
      {s.sunError && <p className="mt-2 rounded bg-rose-50 px-2 py-1 text-[11px] text-rose-700">{s.sunError}</p>}

      {r && (
        <div className="mt-3 space-y-2" data-testid="sunlight-result">
          <div>
            <div className="h-2.5 rounded" style={{ background: RAMP_CSS }} />
            <div className="mt-0.5 flex justify-between text-[10px] text-ink-muted">
              <span>0 小時</span>
              <span>{(r.totalHours / 2).toFixed(1)}</span>
              <span>{r.totalHours.toFixed(1)} 小時</span>
            </div>
          </div>
          {r.stats ? (
            <>
              <div className="grid grid-cols-4 gap-1 text-center text-[11px]" data-testid="sun-stats">
                {r.stats.map((o) => (
                  <div key={o.label} className="rounded bg-slate-50 py-1"><div className="text-ink-muted">{o.label}</div><b>{o.avg.toFixed(1)} h</b></div>
                ))}
              </div>
              <div className="flex gap-1 text-center text-[11px]">
                <div className="flex-1 rounded bg-slate-50 py-1 text-ink-muted">{r.floors ? '本案外牆' : '外牆'}網格</div>
                {r.pctOver.map((o) => (
                  <div key={o.h} className="flex-1 rounded bg-slate-50 py-1"><span className="text-ink-muted">≥{o.h}h </span><b>{Math.round(o.pct * 100)}%</b></div>
                ))}
              </div>
              <p className="text-[10px] text-ink-muted">共 {r.buildings} 棟建物、{r.cells?.count.toLocaleString()} 個外牆／屋頂網格（外牆約 3 m × 每層）。</p>
            </>
          ) : (
            <div className="grid grid-cols-4 gap-1 text-center text-[11px]">
              <div className="rounded bg-slate-50 py-1"><div className="text-ink-muted">平均</div><b>{(r.avgHours ?? 0).toFixed(1)} h</b></div>
              {r.pctOver.map((o) => (
                <div key={o.h} className="rounded bg-slate-50 py-1"><div className="text-ink-muted">≥{o.h} 小時</div><b>{Math.round(o.pct * 100)}%</b></div>
              ))}
            </div>
          )}
          {r.floors && (
            <div className="max-h-56 overflow-y-auto rounded border border-slate-100" data-testid="sun-floor-table">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-white text-ink-muted">
                  <tr>
                    <th className="px-1.5 py-1 text-left">樓層</th>
                    {byTower.map((t) => <th key={t} className="px-1.5 py-1 text-right">{towerLabel(t) || t} 平均／最多</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[...new Set(r.floors.map((f) => f.level))].sort((a, b) => b - a).map((lv) => (
                    <tr key={lv} className="border-t border-slate-50">
                      <td className="px-1.5 py-0.5">{lv}F</td>
                      {byTower.map((t) => {
                        const f = r.floors!.find((x) => x.tower === t && x.level === lv)
                        return (
                          <td key={t} className="px-1.5 py-0.5 text-right tabular-nums">
                            {f ? <>{f.avg.toFixed(1)} / <span className={f.max < 1 ? 'font-semibold text-rose-600' : 'font-semibold'}>{f.max.toFixed(1)}</span> h</> : '—'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="rounded-lg bg-slate-50 p-2" data-testid="sun-anim">
            <div className="flex items-center gap-2 text-[11px]">
              <button className="btn-ghost px-2 py-0.5 text-[11px]" data-testid="sun-play" onClick={() => { if (s.sunStep == null) s.setSunStep(0); setPlaying(!playing) }}>{playing ? '⏸ 暫停' : '▶ 陰影動畫'}</button>
              <input type="range" className="flex-1 accent-brand" min={0} max={r.steps.length - 1} value={s.sunStep ?? 0} data-testid="sun-slider" onChange={(e) => { setPlaying(false); s.setSunStep(+e.target.value) }} />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-ink-muted">
              {step ? (
                <>
                  <span><b className="text-ink">{fmtClock(step.t)}</b> 方位 {step.azimuth.toFixed(0)}°・高度角 {step.elevation.toFixed(0)}°</span>
                  <button className="text-brand underline" onClick={() => { setPlaying(false); s.setSunStep(null) }}>看日照時數</button>
                </>
              ) : (
                <span>拖曳時間軸或播放，看各時刻的陰影（黃＝受照、深色＝陰影）</span>
              )}
            </div>
          </div>
          <p className="text-[10px] leading-snug text-ink-muted">
            {r.floors ? '每層表：平均＝該層外牆各網格平均；最多＝日照最好的位置，紅字表示整層沒有任何位置達 1 小時。' : ''}參考：建築技術規則以冬至日有效日照 1 小時檢討住宅區建築物高度。地形視為平坦；周邊建物：{r.source}。
          </p>
          <button className="btn-ghost w-full py-1 text-xs" data-testid="clear-sunlight" onClick={() => s.clearSunlight()}>清除日照分析</button>
        </div>
      )}
    </section>
  )
}
