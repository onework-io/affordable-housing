// 右側：社區基本資料 → 房源（戶號）清單 → 戶別詳細內容與 720 環景
import { useMemo } from 'react'
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
          <dd>{c.model ? <span className="chip bg-emerald-50 text-emerald-700">已對應 · {c.model.source}</span> : <span className="chip bg-amber-50 text-amber-700">待提供 · 量體示意</span>}</dd>
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
        {c.note && <p className="mt-2 rounded bg-slate-50 p-2 text-[11px] text-ink-muted">{c.note}</p>}
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
      {unit.panoUrl && <p className="mt-2 text-[11px] text-ink-faint">環景為示範連結（{DEMO_VR.provider}，非本戶實景）。</p>}
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
