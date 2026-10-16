// 資料同步紀錄：排程更新、欄位檢核、異常紀錄與手動重試（PoC 為模擬）
import { useState } from 'react'
import { useAdminStore } from '../adminStore'
import { Badge, Card, PageHeader, Table, fmtTime, toast } from '../ui'
import { listCommunitiesAll, listUnits } from '@/services/api'

const JOBS = [
  { job: '住宅與戶別資料', source: '既有可負擔住宅交易平台', schedule: '每日 02:00' },
  { job: '出售狀態與戶數', source: '既有可負擔住宅交易平台', schedule: '每 30 分鐘' },
  { job: '環景連結有效性', source: '既有 720 環景平台', schedule: '每日 03:00' },
]

export function SyncLogs() {
  const a = useAdminStore()
  const [running, setRunning] = useState('')
  const last = (job: string) => a.syncLogs.find((l) => l.job === job)
  const run = (job: string) => {
    setRunning(job)
    setTimeout(() => {
      const units = listCommunitiesAll().flatMap((c) => listUnits(c.id))
      if (job === '住宅與戶別資料') a.addSyncLog({ job, result: 'failed', records: 0, message: '既有交易平台 API 尚未介接（待取得規格），已保留上次資料', by: '業務管理員（示範）' })
      else if (job === '出售狀態與戶數') a.addSyncLog({ job, result: 'success', records: units.length, message: `比對 ${units.length} 戶，銷售中 ${units.filter((u) => u.status === 'on-sale').length} 戶`, by: '業務管理員（示範）' })
      else {
        const open = units.filter((u) => u.status !== 'sold')
        const miss = open.filter((u) => !u.panoUrl).length
        a.addSyncLog({ job, result: miss ? 'warning' : 'success', records: open.length, message: `${miss} 戶尚未提供環景連結`, by: '業務管理員（示範）' })
      }
      a.log('手動執行同步', job)
      setRunning('')
      toast(`「${job}」同步完成`)
    }, 900)
  }
  const tone = (r: string) => (r === 'success' ? 'green' : r === 'warning' ? 'amber' : 'red') as 'green' | 'amber' | 'red'
  const label = (r: string) => (r === 'success' ? '成功' : r === 'warning' ? '有警告' : '失敗')

  return (
    <div className="space-y-4">
      <PageHeader title="資料同步紀錄" desc="住宅、戶別、銷售狀態與環景連結的排程同步。同步失敗時保留上次完整資料，不以空資料覆蓋。" />
      <Card title="同步工作">
        <Table head={['工作', '資料來源', '排程', '最近結果', '最近執行', '']}>
          {JOBS.map((j) => {
            const l = last(j.job)
            return (
              <tr key={j.job}>
                <td className="px-2 py-2 font-medium">{j.job}</td>
                <td className="px-2 py-2 text-ink-muted">{j.source}</td>
                <td className="px-2 py-2">{j.schedule}</td>
                <td className="px-2 py-2">{l ? <Badge tone={tone(l.result)}>{label(l.result)}</Badge> : '—'}</td>
                <td className="px-2 py-2 text-xs text-ink-muted">{l ? fmtTime(l.time) : '—'}</td>
                <td className="px-2 py-2 text-right">
                  <button className="btn-ghost py-1 text-xs" disabled={!!running} onClick={() => run(j.job)}>{running === j.job ? '同步中…' : '立即同步'}</button>
                </td>
              </tr>
            )
          })}
        </Table>
      </Card>
      <Card title="同步紀錄">
        <Table head={['時間', '工作', '結果', '筆數', '說明', '執行者']} empty={a.syncLogs.length === 0}>
          {a.syncLogs.map((l) => (
            <tr key={l.id}>
              <td className="whitespace-nowrap px-2 py-1.5 text-xs text-ink-muted">{fmtTime(l.time)}</td>
              <td className="px-2 py-1.5">{l.job}</td>
              <td className="px-2 py-1.5"><Badge tone={tone(l.result)}>{label(l.result)}</Badge></td>
              <td className="px-2 py-1.5 tabular-nums">{l.records}</td>
              <td className="px-2 py-1.5">{l.message}</td>
              <td className="px-2 py-1.5 text-ink-muted">{l.by}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  )
}
