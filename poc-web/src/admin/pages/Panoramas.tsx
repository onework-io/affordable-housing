// 環景連結管理：戶別 ↔ 720 環景連結、缺漏與格式檢核
import { useState } from 'react'
import { useAdminStore } from '../adminStore'
import { Badge, Card, Field, PageHeader, Stat, Table, inputCls, toast } from '../ui'
import { listCommunitiesAll, listUnits } from '@/services/api'
import { DEMO_VR } from '@/config/vr'

const valid = (u: string) => /^https:\/\/[^\s]+$/.test(u)

export function Panoramas() {
  useAdminStore()
  const setUnit = useAdminStore((s) => s.setUnit)
  const addSync = useAdminStore((s) => s.addSyncLog)
  const log = useAdminStore((s) => s.log)
  const cs = listCommunitiesAll()
  const [cid, setCid] = useState('')
  const [filter, setFilter] = useState('missing')
  const units = cs.filter((c) => !cid || c.id === cid).flatMap((c) => listUnits(c.id).filter((u) => u.status !== 'sold').map((u) => ({ ...u, cname: c.name })))
  const missing = units.filter((u) => !u.panoUrl)
  const invalid = units.filter((u) => u.panoUrl && !valid(u.panoUrl))
  const rows = units.filter((u) => (filter === 'missing' ? !u.panoUrl : filter === 'invalid' ? u.panoUrl && !valid(u.panoUrl) : filter === 'ok' ? u.panoUrl && valid(u.panoUrl) : true))

  const check = () => {
    addSync({ job: '環景連結有效性', result: missing.length || invalid.length ? 'warning' : 'success', records: units.length, message: `缺漏 ${missing.length} 戶、格式錯誤 ${invalid.length} 戶`, by: '業務管理員（示範）' })
    toast(`檢核完成：缺漏 ${missing.length} 戶、格式錯誤 ${invalid.length} 戶`)
  }
  const fillDemo = () => {
    for (const u of missing) setUnit(u.id, { panoUrl: DEMO_VR.url }, u.label)
    log('批次套用示範環景', `${missing.length} 戶`, DEMO_VR.provider)
    toast(`已為 ${missing.length} 戶套用示範環景連結`)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="環景連結管理"
        desc="每一戶對應既有 720 環景平台的連結。前台「開啟 720 環景看屋」讀取這裡的設定；沒有連結的戶別顯示「尚未提供」。"
        actions={
          <>
            <button className="btn-ghost" onClick={check}>檢核全部連結</button>
            <button className="btn-primary" disabled={!missing.length} onClick={fillDemo}>缺漏戶別套用示範連結</button>
          </>
        }
      />
      <div className="grid grid-cols-3 gap-3">
        <Stat label="未售戶別（銷售中＋保留）" value={units.length} tone="gray" />
        <Stat label="缺少環景" value={missing.length} tone={missing.length ? 'amber' : 'green'} />
        <Stat label="格式錯誤" value={invalid.length} tone={invalid.length ? 'red' : 'green'} />
      </div>
      <Card>
        <div className="grid gap-3 sm:grid-cols-[220px_200px]">
          <Field label="社區">
            <select className={inputCls} value={cid} onChange={(e) => setCid(e.target.value)}>
              <option value="">全部社區</option>
              {cs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="檢核結果">
            <select className={inputCls} value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="missing">缺少環景</option>
              <option value="invalid">格式錯誤</option>
              <option value="ok">正常</option>
              <option value="">全部</option>
            </select>
          </Field>
        </div>
      </Card>
      <Card title={`戶別（${rows.length}）`}>
        <Table head={['社區', '戶別', '狀態', '環景連結', '檢核']} empty={rows.length === 0}>
          {rows.slice(0, 80).map((u) => (
            <tr key={u.id}>
              <td className="whitespace-nowrap px-2 py-1.5">{u.cname}</td>
              <td className="whitespace-nowrap px-2 py-1.5 font-medium">{u.label}</td>
              <td className="whitespace-nowrap px-2 py-1.5">{u.status === 'on-sale' ? <Badge tone="green">銷售中</Badge> : <Badge tone="amber">保留</Badge>}</td>
              <td className="w-full px-2 py-1.5">
                <input
                  className="w-full min-w-[260px] rounded border border-slate-200 px-1.5 py-0.5 text-xs"
                  placeholder="https://…"
                  defaultValue={u.panoUrl ?? ''}
                  onBlur={(e) => {
                    const v = e.target.value.trim() || null
                    if (v !== u.panoUrl) { setUnit(u.id, { panoUrl: v }, u.label); toast(`已更新 ${u.label} 環景連結`) }
                  }}
                />
              </td>
              <td className="whitespace-nowrap px-2 py-1.5">{!u.panoUrl ? <Badge tone="amber">缺漏</Badge> : valid(u.panoUrl) ? <Badge tone="green">正常</Badge> : <Badge tone="red">格式錯誤</Badge>}</td>
            </tr>
          ))}
        </Table>
        {rows.length > 80 && <p className="mt-2 text-xs text-ink-faint">只顯示前 80 筆，請用篩選縮小範圍。</p>}
      </Card>
    </div>
  )
}
