// 左側：生活圈設定（起點、交通方式、時間、設施分類）與圈內社區
import { CATEGORY, CATEGORY_KEYS, MODE_LABEL } from '@/config/lifeCircle'
import { useAdminStore } from '@/admin/adminStore'
import { useAppStore } from '@/store/useAppStore'
import { busStats, fmtKm } from '@/utils/geo'
import type { TravelMode } from '@/types'
import { AREA_BANDS, PRICE_BANDS, ROOM_OPTIONS, isFilterActive, type Band } from '@/config/filters'

const chip = (on: boolean) =>
  `rounded-full border px-2.5 py-1 text-xs font-medium transition ${on ? 'border-brand bg-brand text-white' : 'border-slate-200 bg-white text-ink hover:bg-brand-soft'}`

function BandChips({ bands, value, onChange, prefix }: { bands: Band[]; value: string; onChange: (id: string) => void; prefix: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {bands.map((b) => (
        <button key={b.id} data-testid={`${prefix}-${b.id}`} className={chip(value === b.id)} onClick={() => onChange(b.id)}>
          {b.label}
        </button>
      ))}
    </div>
  )
}

export function LeftPanel() {
  const s = useAppStore()
  const lc = useAdminStore((a) => a.lifeCircle)
  const catEnabled = useAdminStore((a) => a.categoryEnabled)
  const ticks: number[] = []
  for (let m = lc.min; m <= lc.max; m += lc.step) ticks.push(m)
  const centerValue = s.center.type === 'community' ? s.center.id : '__point'
  const inCircle = s.result?.communities ?? []
  const fActive = isFilterActive(s.filter)
  const listed = inCircle.filter((c) => (!s.onlyOnSale || (s.onSaleCounts[c.id] ?? 0) > 0) && (!fActive || (s.matchCounts[c.id] ?? 0) > 0))
  const matchTotal = Object.values(s.matchCounts).reduce((a, b) => a + b, 0)
  const matchCommunities = Object.values(s.matchCounts).filter((n) => n > 0).length
  const matchInCircle = inCircle.reduce((n, c) => n + (s.matchCounts[c.id] ?? 0), 0)
  const onSaleTotal = listed.reduce((n, c) => n + (s.onSaleCounts[c.id] ?? 0), 0)
  const facCount = (cat: string) => s.result?.facilities.filter((f) => f.category === cat).length ?? 0

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col gap-3 overflow-y-auto p-3">
      <section className="panel space-y-3 p-4">
        <h2 className="text-base font-bold">生活圈設定</h2>

        <div className="space-y-1">
          <div className="label">起點</div>
          <select
            data-testid="center-select"
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-ink"
            value={centerValue}
            onChange={(e) => (e.target.value === '__point' ? s.startPickPoint() : s.setCenterCommunity(e.target.value))}
          >
            {s.communities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}（{c.district}）
              </option>
            ))}
            <option value="__point">地圖指定位置（工作地點、學校…）</option>
          </select>
          {s.center.type === 'point' && (
            <button className="text-xs text-brand underline" onClick={s.startPickPoint}>
              重新點選地圖位置
            </button>
          )}
        </div>

        <div className="space-y-1">
          <div className="label">交通方式</div>
          <div className="flex gap-2">
            {(['walk', 'drive'] as TravelMode[]).map((m) => (
              <button key={m} data-testid={`mode-${m}`} className={`seg ${s.mode === m ? 'seg-on' : 'seg-off'}`} onClick={() => s.setMode(m)}>
                {m === 'walk' ? '🚶 ' : '🚗 '}
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="label">時間</span>
            <span className="text-sm font-semibold">{s.minutes} 分鐘</span>
          </div>
          <input
            data-testid="minutes"
            type="range"
            min={lc.min}
            max={lc.max}
            step={lc.step}
            value={s.minutes}
            onChange={(e) => s.setMinutes(Number(e.target.value))}
            className="w-full accent-brand"
          />
          <div className="flex justify-between text-[10px] text-ink-faint">
            {ticks.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
          {s.query && (
            <p className="text-xs text-ink-muted">
              半徑 = {lc[s.mode]} km/h × {s.minutes} 分 ≈ <b className="text-ink">{fmtKm(s.query.radiusKm)}</b>
            </p>
          )}
        </div>

        <button className="btn-primary w-full" data-testid="analyze" onClick={() => s.runQuery(true)}>
          分析生活圈
        </button>
      </section>

      <section className="panel space-y-3 p-4" data-testid="filter-panel">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">條件篩選</h2>
          {fActive && (
            <button className="text-xs text-brand underline" data-testid="filter-reset" onClick={s.resetFilter}>
              清除條件
            </button>
          )}
        </div>
        <div className="space-y-1.5">
          <div className="label">總價</div>
          <BandChips bands={PRICE_BANDS} value={s.filter.price} prefix="price" onChange={(price) => s.setFilter({ price })} />
        </div>
        <div className="space-y-1.5">
          <div className="label">坪數（含公設）</div>
          <BandChips bands={AREA_BANDS} value={s.filter.area} prefix="area" onChange={(area) => s.setFilter({ area })} />
        </div>
        <div className="space-y-1.5">
          <div className="label">房數（可複選）</div>
          <div className="flex flex-wrap gap-1.5">
            {ROOM_OPTIONS.map((n) => {
              const on = s.filter.rooms.includes(n)
              return (
                <button key={n} data-testid={`rooms-${n}`} className={chip(on)} onClick={() => s.setFilter({ rooms: on ? s.filter.rooms.filter((x) => x !== n) : [...s.filter.rooms, n] })}>
                  {n} 房
                </button>
              )
            })}
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="accent-brand" data-testid="pano-only" checked={s.filter.panoOnly} onChange={(e) => s.setFilter({ panoOnly: e.target.checked })} />
          只看有 720 環景的戶別
        </label>
        <div className="rounded-lg bg-brand-soft px-3 py-2 text-sm" data-testid="filter-result">
          {fActive ? (
            <>
              符合條件 <b className="text-rose-600">{matchTotal}</b> 戶 · {matchCommunities} 個社區
              <div className="text-xs text-ink-muted">其中生活圈內 {matchInCircle} 戶</div>
            </>
          ) : (
            <span className="text-ink-muted">設定條件後，地圖與清單只留下符合的社區與戶別</span>
          )}
        </div>
        {s.filter.price !== 'all' && <p className="text-[11px] text-ink-faint">總價條件不含「待公告」戶別。</p>}
      </section>

      <section className="panel space-y-2 p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-bold">圈內社區 {listed.length} 個</h3>
          <span className="text-xs text-ink-muted">
            {fActive ? <>符合 <b className="text-rose-600">{matchInCircle}</b> 戶</> : <>列出售中 <b className="text-rose-600">{onSaleTotal}</b> 戶</>}
          </span>
        </div>
        {listed.length === 0 && <p className="text-xs text-ink-muted">{fActive ? '圈內沒有符合條件的社區，可放寬條件或加長時間。' : '圈內沒有可負擔住宅，可加長時間或改為開車。'}</p>}
        <ul className="space-y-1">
          {listed.map((c) => {
            const info = s.communities.find((x) => x.id === c.id)!
            const total = info.towers.reduce((n, t) => n + (t.toFloor - t.fromFloor + 1) * t.unitCodes.length, 0)
            return (
              <li key={c.id} className={`flex items-center gap-1 rounded-lg hover:bg-brand-soft ${s.selectedCommunityId === c.id ? 'bg-brand-soft' : ''}`}>
                <button onClick={() => s.selectCommunity(c.id)} className="min-w-0 flex-1 px-2 py-1.5 text-left text-sm">
                  <div className="font-semibold text-brand">🏠 {info.name}</div>
                  <div className="text-xs text-ink-muted">
                    {fActive ? (
                      <>符合 <b className="text-rose-600">{s.matchCounts[c.id] ?? 0}</b> 戶 ／ 出售中 {s.onSaleCounts[c.id] ?? 0} 戶</>
                    ) : (
                      <>{total} 戶 ／ 出售中 {s.onSaleCounts[c.id] ?? 0} 戶</>
                    )}{' '}
                    · {fmtKm(c.distanceKm)}
                  </div>
                </button>
                <button
                  data-testid={`cmp-${c.id}`}
                  title="加入社區比較"
                  className={`mr-1 shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${s.compareIds.includes(c.id) ? 'border-brand bg-brand text-white' : 'border-slate-200 bg-white text-ink-muted hover:border-brand-line'}`}
                  onClick={() => s.toggleCompare(c.id)}
                >
                  {s.compareIds.includes(c.id) ? '✓ 比較' : '＋比較'}
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="panel space-y-2 p-4">
        <h3 className="text-sm font-bold">顯示周邊設施</h3>
        {CATEGORY_KEYS.filter((cat) => catEnabled[cat] !== false).map((cat) => (
          <label key={cat} className="flex cursor-pointer items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <input type="checkbox" className="accent-brand" checked={s.categories.has(cat)} onChange={() => s.toggleCategory(cat)} />
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: `rgb(${CATEGORY[cat].color.join(',')})` }} />
              {CATEGORY[cat].label}
            </span>
            <span className="text-xs text-ink-muted">圈內 {facCount(cat)}</span>
          </label>
        ))}
        <label className="flex cursor-pointer items-center justify-between border-t border-slate-100 pt-2 text-sm">
          <span className="flex items-center gap-2">
            <input type="checkbox" className="accent-brand" data-testid="show-bus" checked={s.showBus} onChange={(e) => s.setShowBus(e.target.checked)} />
            <span className="inline-block h-3 w-3 rounded-[3px]" style={{ background: 'rgb(37,99,235)' }} />
            公車站牌
          </span>
          <span className="text-xs text-ink-muted" data-testid="bus-count">
            {s.query ? (() => { const b = busStats(s.query.center, s.query.radiusKm, s.busStops); return `圈內 ${b.stops} 站 · ${b.routes} 線` })() : ''}
          </span>
        </label>
        <div className="flex items-center justify-between text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="accent-brand" data-testid="bus-sim" checked={s.busSim} onChange={(e) => s.setBusSim(e.target.checked)} />
            🚌 動態公車（模擬）
          </label>
          <div className="flex overflow-hidden rounded-md border border-slate-200 text-[11px]">
            {[1, 10, 30].map((v) => (
              <button key={v} data-testid={`bus-speed-${v}`} className={`px-1.5 py-0.5 ${s.busSpeed === v ? 'bg-ink text-white' : 'hover:bg-brand-soft'}`} onClick={() => s.setBusSpeed(v)}>
                {v}×
              </button>
            ))}
          </div>
        </div>
        <p className="text-[10px] leading-snug text-ink-faint">公車站牌位置 © OpenStreetMap；經過路線為桃園市公車動態資訊系統 2017 年資料。動態公車依站序與路網模擬行駛，非即時位置。</p>
        <label className="flex cursor-pointer items-center gap-2 border-t border-slate-100 pt-2 text-sm">
          <input type="checkbox" className="accent-brand" checked={s.onlyOnSale} onChange={(e) => s.setOnlyOnSale(e.target.checked)} />
          僅顯示銷售中
        </label>
      </section>
    </aside>
  )
}
