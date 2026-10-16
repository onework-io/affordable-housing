// 操作紀錄：所有後台修改都留下紀錄（人員、時間、動作、對象、內容）
import { useState } from 'react'
import { useAdminStore } from '../adminStore'
import { Card, Field, PageHeader, Table, fmtTime, inputCls } from '../ui'

export function AuditLog() {
  const audit = useAdminStore((s) => s.audit)
  const [q, setQ] = useState('')
  const [action, setAction] = useState('')
  const actions = [...new Set(audit.map((a) => a.action))]
  const rows = audit.filter((a) => (!action || a.action === action) && (!q || `${a.target}${a.detail ?? ''}${a.user}`.includes(q)))
  return (
    <div className="space-y-4">
      <PageHeader title="操作紀錄" desc="後台每一次儲存都會記錄；正式版保存於伺服器並依規定保存期限管理。" />
      <Card>
        <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
          <Field label="動作">
            <select className={inputCls} value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">全部</option>
              {actions.map((a) => <option key={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="關鍵字"><input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="對象、內容或人員" /></Field>
        </div>
      </Card>
      <Card title={`紀錄（${rows.length}）`}>
        <Table head={['時間', '人員', '動作', '對象', '內容']} empty={rows.length === 0}>
          {rows.map((a) => (
            <tr key={a.id}>
              <td className="whitespace-nowrap px-2 py-1.5 text-xs text-ink-muted">{fmtTime(a.time)}</td>
              <td className="whitespace-nowrap px-2 py-1.5">{a.user}</td>
              <td className="whitespace-nowrap px-2 py-1.5">{a.action}</td>
              <td className="px-2 py-1.5">{a.target}</td>
              <td className="px-2 py-1.5 text-ink-muted">{a.detail ?? '—'}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  )
}
