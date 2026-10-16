// 戶別資料管理：檢視各社區戶別、調整銷售狀態與總價（示範；正式版由既有平台同步）
import { useState } from 'react'
import { useAdminStore } from '../adminStore'
import { Badge, Card, Field, PageHeader, Table, inputCls, toast } from '../ui'
import { listCommunitiesAll, listUnits } from '@/services/api'
import type { UnitStatus } from '@/types'

const STATUS: Record<UnitStatus, { label: string; tone: 'green' | 'amber' | 'gray' }> = {
  'on-sale': { label: '銷售中', tone: 'green' },
  reserved: { label: '保留', tone: 'amber' },
  sold: { label: '已售', tone: 'gray' },
}
const PAGE = 40

export function Units() {
  useAdminStore()
  const setUnit = useAdminStore((s) => s.setUnit)
  const cs = listCommunitiesAll()
  const [cid, setCid] = useState(cs[0]?.id ?? '')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const c = cs.find((x) => x.id === cid)
  const all = listUnits(cid)
  const rows = all.filter((u) => (!status || u.status === status) && (!q || u.label.includes(q.toUpperCase()) || u.label.includes(q)))
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE)
  const count = (s: UnitStatus) => all.filter((u) => u.status === s).length

  return (
    <div className="space-y-4">
      <PageHeader title="戶別資料管理" desc="戶別、格局、坪數與銷售狀態。正式版由既有交易平台同步，這裡的修改僅供示範。" />
      <Card>
        <div className="grid gap-3 sm:grid-cols-[220px_160px_1fr]">
          <Field label="社區">
            <select className={inputCls} value={cid} onChange={(e) => { setCid(e.target.value); setPage(0) }}>
              {cs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field label="銷售狀態">
            <select className={inputCls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(0) }}>
              <option value="">全部</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="戶別">
            <input className={inputCls} placeholder="例如 12F 或 A3" value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} />
          </Field>
        </div>
        {c && (
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Badge tone="gray">總戶數 {all.length}</Badge>
            <Badge tone="green">銷售中 {count('on-sale')}</Badge>
            <Badge tone="amber">保留 {count('reserved')}</Badge>
            <Badge tone="gray">已售 {count('sold')}</Badge>
          </div>
        )}
      </Card>
      <Card title={`戶別清單（${rows.length}）`}>
        <Table head={['戶別', '棟', '樓層', '格局', '建坪', '室內坪', '總價（萬）', '銷售狀態', '環景']} empty={rows.length === 0}>
          {shown.map((u) => (
            <tr key={u.id} className="hover:bg-slate-50">
              <td className="px-2 py-1.5 font-medium">{u.label}</td>
              <td className="px-2 py-1.5">{c?.towers.find((t) => t.id === u.tower)?.label || '—'}</td>
              <td className="px-2 py-1.5 tabular-nums">{u.level}F</td>
              <td className="px-2 py-1.5">{u.layout}</td>
              <td className="px-2 py-1.5 tabular-nums">{u.area}</td>
              <td className="px-2 py-1.5 tabular-nums">{u.indoorArea}</td>
              <td className="px-2 py-1.5">
                <input
                  type="number"
                  className="w-24 rounded border border-slate-200 px-1.5 py-0.5 text-sm tabular-nums"
                  placeholder="待公告"
                  defaultValue={u.price ?? ''}
                  onBlur={(e) => {
                    const v = e.target.value === '' ? null : +e.target.value
                    if (v !== u.price) { setUnit(u.id, { price: v }, u.label); toast(`已更新 ${u.label} 總價`) }
                  }}
                />
              </td>
              <td className="px-2 py-1.5">
                <select
                  className="rounded border border-slate-200 px-1.5 py-0.5 text-sm"
                  value={u.status}
                  onChange={(e) => { setUnit(u.id, { status: e.target.value as UnitStatus }, u.label); toast(`${u.label} 改為${STATUS[e.target.value as UnitStatus].label}`) }}
                >
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </td>
              <td className="px-2 py-1.5">{u.panoUrl ? <Badge tone="green">有</Badge> : <Badge tone="gray">未提供</Badge>}</td>
            </tr>
          ))}
        </Table>
        {pages > 1 && (
          <div className="mt-3 flex items-center justify-end gap-2 text-sm">
            <button className="btn-ghost py-1" disabled={page === 0} onClick={() => setPage(page - 1)}>上一頁</button>
            <span className="tabular-nums text-ink-muted">{page + 1} / {pages}</span>
            <button className="btn-ghost py-1" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>下一頁</button>
          </div>
        )}
      </Card>
    </div>
  )
}
