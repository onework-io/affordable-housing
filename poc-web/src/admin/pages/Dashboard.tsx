import { useAdminStore } from '../adminStore'
import { Badge, Card, PageHeader, Stat, Table, fmtTime, toast } from '../ui'
import { listCommunitiesAll, listFacilities, listUnits } from '@/services/api'
import { navigate } from '@/router'

export function Dashboard() {
  const a = useAdminStore()
  const cs = listCommunitiesAll()
  const units = cs.flatMap((c) => listUnits(c.id))
  const onSale = units.filter((u) => u.status === 'on-sale')
  const missingPano = onSale.filter((u) => !u.panoUrl).length
  const modelled = cs.filter((c) => c.model).length
  const pending = cs.filter((c) => c.model?.status === 'pending' || !c.model).length
  const lastSync = a.syncLogs[0]
  const todo = [
    pending && { t: `${pending} 個社區尚未完成模型對應`, go: '/admin/communities', tone: 'amber' as const },
    missingPano && { t: `${missingPano} 戶銷售中但尚未提供環景`, go: '/admin/panoramas', tone: 'amber' as const },
    a.syncLogs.some((l) => l.result === 'failed') && { t: '有資料同步失敗，請查看同步紀錄', go: '/admin/sync', tone: 'red' as const },
  ].filter(Boolean) as { t: string; go: string; tone: 'amber' | 'red' }[]

  return (
    <div className="space-y-4">
      <PageHeader
        title="管理首頁"
        desc="前台圖台的社區、模型、戶別與圖層，都在這裡維護；儲存後回到前台即生效。"
        actions={
          <button
            className="btn-ghost"
            onClick={() => {
              a.resetAll()
              toast('已還原示範設定')
            }}
          >
            還原示範設定
          </button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="社區（啟用／全部）" value={`${cs.filter((c) => c.enabled).length} / ${cs.length}`} />
        <Stat label="已對應 3D 模型" value={modelled} sub={`其餘 ${cs.length - modelled} 個以量體示意`} />
        <Stat label="戶別總數" value={units.length.toLocaleString()} tone="gray" />
        <Stat label="平台列出售中" value={onSale.length} tone="red" />
        <Stat label="銷售中環景覆蓋" value={`${onSale.length ? Math.round(((onSale.length - missingPano) / onSale.length) * 100) : 0}%`} sub={`缺 ${missingPano} 戶`} tone={missingPano ? 'amber' : 'green'} />
        <Stat label="生活設施" value={listFacilities(true).length} sub={`後台匯入 ${a.importedFacilities.length} 筆`} tone="gray" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="待處理事項">
          {todo.length === 0 ? (
            <p className="text-sm text-ink-muted">目前沒有待處理事項。</p>
          ) : (
            <ul className="space-y-2">
              {todo.map((t) => (
                <li key={t.t} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <Badge tone={t.tone}>{t.tone === 'red' ? '異常' : '待處理'}</Badge>
                    {t.t}
                  </span>
                  <button className="text-xs font-medium text-brand underline" onClick={() => navigate(t.go)}>
                    前往處理
                  </button>
                </li>
              ))}
            </ul>
          )}
          {lastSync && (
            <p className="mt-3 text-xs text-ink-faint">
              最近同步：{fmtTime(lastSync.time)}・{lastSync.job}・{lastSync.message}
            </p>
          )}
        </Card>
        <Card title="最近操作" actions={<button className="text-xs text-brand underline" onClick={() => navigate('/admin/audit')}>全部紀錄</button>}>
          <Table head={['時間', '人員', '動作', '對象']}>
            {a.audit.slice(0, 6).map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap px-2 py-1.5 text-xs text-ink-muted">{fmtTime(l.time)}</td>
                <td className="px-2 py-1.5">{l.user}</td>
                <td className="px-2 py-1.5">{l.action}</td>
                <td className="px-2 py-1.5 text-ink-muted">{l.target}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </div>
  )
}
