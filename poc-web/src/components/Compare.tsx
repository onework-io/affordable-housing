// 社區比較：最多 3 個社區並列比較戶數、價格、坪數、環景與生活機能
import { useMemo } from 'react'
import { CATEGORY, CATEGORY_KEYS } from '@/config/lifeCircle'
import { filterSummary, isFilterActive, matchUnit, roomsOf } from '@/config/filters'
import { useAppStore } from '@/store/useAppStore'
import type { Community, Unit } from '@/types'
import { busStats, fmtKm, haversine } from '@/utils/geo'

/** 地圖下方的比較列 */
export function CompareBar() {
  const s = useAppStore()
  if (!s.compareIds.length) return null
  const names = s.compareIds.map((id) => s.communities.find((c) => c.id === id)).filter(Boolean) as Community[]
  return (
    <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-brand-line bg-white/95 px-3 py-2 shadow-card" data-testid="compare-bar">
      <span className="whitespace-nowrap text-xs font-semibold text-ink-muted">社區比較</span>
      {names.map((c) => (
        <span key={c.id} className="chip whitespace-nowrap bg-brand-soft text-brand">
          {c.name}
          <button className="ml-0.5 text-ink-faint hover:text-ink" aria-label={`移除 ${c.name}`} onClick={() => s.toggleCompare(c.id)}>
            ×
          </button>
        </span>
      ))}
      {names.length < 2 && <span className="whitespace-nowrap text-xs text-ink-muted">再選 1 個社區即可比較（最多 3 個）</span>}
      <button className="btn-primary whitespace-nowrap py-1 text-xs" data-testid="open-compare" disabled={names.length < 2} onClick={() => s.setCompareOpen(true)}>
        開始比較（{names.length}）
      </button>
      <button className="whitespace-nowrap text-xs text-ink-muted underline" onClick={s.clearCompare}>
        清除
      </button>
    </div>
  )
}

interface Stats {
  c: Community
  total: number
  onSale: number
  matched: number | null
  priceMin: number | null
  priceMax: number | null
  unitPrice: number | null
  areaMin: number | null
  areaMax: number | null
  rooms: number[]
  pano: number
  dist: number | null
  fac: number[]
  bus: { stops: number; routes: number; nearestKm: number | null }
}

function stats(c: Community, units: Unit[], ctx: ReturnType<typeof useAppStore.getState>): Stats {
  const onSale = units.filter((u) => u.status === 'on-sale')
  const priced = onSale.filter((u) => u.price != null)
  const prices = priced.map((u) => u.price!)
  const areas = onSale.map((u) => u.area)
  const r = FAC_RADIUS_KM
  return {
    c,
    total: c.towers.reduce((n, t) => n + (t.toFloor - t.fromFloor + 1) * t.unitCodes.length, 0),
    onSale: onSale.length,
    matched: isFilterActive(ctx.filter) ? onSale.filter((u) => matchUnit(u, ctx.filter)).length : null,
    priceMin: prices.length ? Math.min(...prices) : null,
    priceMax: prices.length ? Math.max(...prices) : null,
    unitPrice: priced.length ? priced.reduce((n, u) => n + u.price! / u.area, 0) / priced.length : null,
    areaMin: areas.length ? Math.min(...areas) : null,
    areaMax: areas.length ? Math.max(...areas) : null,
    rooms: [...new Set(onSale.map(roomsOf))].sort(),
    pano: onSale.filter((u) => u.panoUrl).length,
    dist: ctx.query ? haversine(ctx.query.center, c.lngLat) : null,
    bus: busStats(c.lngLat, FAC_RADIUS_KM, ctx.busStops),
    fac: CATEGORY_KEYS.map((cat) => ctx.facilities.filter((f) => f.category === cat && haversine(c.lngLat, f.lngLat) <= r).length),
  }
}

/** 生活機能固定以社區周邊 1 公里（約步行 12 分鐘）比較，不受生活圈半徑影響 */
const FAC_RADIUS_KM = 1

type Row = { label: string; value: (x: Stats) => string; num?: (x: Stats) => number | null; best?: 'max' | 'min'; group?: string }

export function CompareModal() {
  const s = useAppStore()
  const list = useMemo(
    () =>
      s.compareIds
        .map((id) => s.communities.find((c) => c.id === id))
        .filter(Boolean)
        .map((c) => stats(c!, s.allUnits[c!.id] ?? [], useAppStore.getState())),
    [s.compareIds, s.communities, s.allUnits, s.filter, s.query, s.facilities, s.busStops],
  )
  if (!s.compareOpen || list.length < 2) return null
  const fActive = isFilterActive(s.filter)
  const r = FAC_RADIUS_KM
  const wan = (n: number | null) => (n == null ? '—' : `${Math.round(n).toLocaleString()} 萬`)

  const rows: Row[] = [
    { group: '基本資料', label: '行政區', value: (x) => x.c.district },
    { label: '樓層', value: (x) => `地上 ${x.c.floorsAbove}／地下 ${x.c.floorsBelow}` },
    { label: '社區總戶數', value: (x) => `${x.total} 戶`, num: (x) => x.total },
    { label: '3D 模型', value: (x) => (x.c.model ? 'BIM 分層模型' : '量體示意') },
    ...(s.query ? [{ label: '距生活圈中心', value: (x: Stats) => (x.dist == null ? '—' : fmtKm(x.dist)), num: (x: Stats) => x.dist, best: 'min' as const }] : []),
    { group: '房源（平台列出售中）', label: '銷售中戶數', value: (x) => `${x.onSale} 戶`, num: (x) => x.onSale, best: 'max' },
    ...(fActive ? [{ label: '符合篩選條件', value: (x: Stats) => `${x.matched} 戶`, num: (x: Stats) => x.matched, best: 'max' as const }] : []),
    { label: '總價區間', value: (x) => (x.priceMin == null ? '待公告' : `${wan(x.priceMin)} – ${wan(x.priceMax)}`) },
    { label: '平均單價', value: (x) => (x.unitPrice == null ? '—' : `${x.unitPrice.toFixed(1)} 萬／坪`), num: (x) => x.unitPrice, best: 'min' },
    { label: '坪數範圍', value: (x) => (x.areaMin == null ? '—' : x.areaMin === x.areaMax ? `${x.areaMin} 坪` : `${x.areaMin} – ${x.areaMax} 坪`) },
    { label: '房型', value: (x) => (x.rooms.length ? x.rooms.map((n) => `${n} 房`).join('、') : '—') },
    { label: '可 720 環景看屋', value: (x) => `${x.pano} 戶`, num: (x) => x.pano, best: 'max' },
    ...CATEGORY_KEYS.map((cat, i) => ({
      group: i === 0 ? `生活機能（社區周邊 ${fmtKm(r)} 內）` : undefined,
      label: CATEGORY[cat].label,
      value: (x: Stats) => `${x.fac[i]} 處`,
      num: (x: Stats) => x.fac[i],
      best: 'max' as const,
    })),
    { label: '公車站牌', value: (x) => `${x.bus.stops} 站`, num: (x) => x.bus.stops, best: 'max' },
    { label: '公車路線', value: (x) => `${x.bus.routes} 線`, num: (x) => x.bus.routes, best: 'max' },
    { label: '最近公車站', value: (x) => (x.bus.nearestKm == null ? '—' : fmtKm(x.bus.nearestKm)), num: (x) => x.bus.nearestKm, best: 'min' },
  ]

  const bestOf = (row: Row) => {
    if (!row.num || !row.best) return null
    const vals = list.map(row.num).filter((v): v is number => v != null)
    if (vals.length < 2 || Math.min(...vals) === Math.max(...vals)) return null
    return row.best === 'max' ? Math.max(...vals) : Math.min(...vals)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 p-6" onClick={() => s.setCompareOpen(false)}>
      <div className="flex max-h-[88vh] w-[min(1040px,94vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()} data-testid="compare-modal">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold">社區比較</h2>
            <p className="text-xs text-ink-muted">
              {fActive ? `篩選條件：${filterSummary(s.filter)} · ` : ''}綠底為該項最佳；生活機能以社區周邊 1 公里計算
            </p>
          </div>
          <button className="text-2xl leading-none text-ink-faint hover:text-ink" onClick={() => s.setCompareOpen(false)} aria-label="關閉">
            ×
          </button>
        </div>
        <div className="overflow-auto px-6 pb-5">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr>
                <th className="w-40 py-3" />
                {list.map((x) => (
                  <th key={x.c.id} className="px-3 py-3 text-left align-top">
                    <div className="text-base font-bold text-brand">{x.c.name}</div>
                    <div className="text-[11px] font-normal text-ink-muted">{x.c.address}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const best = bestOf(row)
                return [
                  row.group && (
                    <tr key={`g-${row.group}`}>
                      <td colSpan={list.length + 1} className="pb-1 pt-4 text-xs font-bold text-ink-muted">
                        {row.group}
                      </td>
                    </tr>
                  ),
                  <tr key={row.label} className="border-t border-slate-100">
                    <td className="py-2 pr-3 text-ink-muted">{row.label}</td>
                    {list.map((x) => {
                      const isBest = best != null && row.num!(x) === best
                      return (
                        <td key={x.c.id} className={`px-3 py-2 ${isBest ? 'bg-brand-soft font-semibold text-brand' : ''}`}>
                          {row.value(x)}
                        </td>
                      )
                    })}
                  </tr>,
                ]
              })}
              <tr className="border-t border-slate-100">
                <td />
                {list.map((x) => (
                  <td key={x.c.id} className="px-3 pt-4">
                    <button
                      className="btn-ghost w-full py-1.5 text-xs"
                      onClick={() => {
                        s.setCompareOpen(false)
                        s.selectCommunity(x.c.id)
                      }}
                    >
                      在地圖查看房源
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-ink-faint">PoC 示範資料；正式版價格、戶數由既有可負擔住宅交易平台同步。</p>
        </div>
      </div>
    </div>
  )
}
