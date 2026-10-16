// 帳號與權限（PoC 示範；正式版由伺服器端驗證權限，不能只靠前端）
import { ROLE_LABEL, useAdminStore, type Role } from '../adminStore'
import { Badge, Card, PageHeader, Table, fmtTime, toast } from '../ui'

const PERMS: [string, Record<Role, string>][] = [
  ['檢視後台資料', { admin: '✓', editor: '✓', viewer: '✓' }],
  ['維護住宅、戶別、環景連結', { admin: '✓', editor: '✓', viewer: '—' }],
  ['維護生活設施與生活圈參數', { admin: '✓', editor: '✓', viewer: '—' }],
  ['手動執行資料同步', { admin: '✓', editor: '✓', viewer: '—' }],
  ['帳號與權限管理', { admin: '✓', editor: '—', viewer: '—' }],
  ['查閱操作紀錄', { admin: '✓', editor: '僅本人', viewer: '—' }],
]

export function Accounts() {
  const a = useAdminStore()
  return (
    <div className="space-y-4">
      <PageHeader title="帳號與權限" desc="依角色控制可維護的資料範圍。PoC 僅示範介面；正式版由伺服器驗證權限，並記錄登入與操作。" />
      <Card title="帳號">
        <Table head={['姓名', '帳號', '單位', '角色', '狀態', '最近登入']}>
          {a.users.map((u) => (
            <tr key={u.id}>
              <td className="px-2 py-2 font-medium">{u.name}</td>
              <td className="px-2 py-2 text-ink-muted">{u.account}</td>
              <td className="px-2 py-2">{u.org}</td>
              <td className="px-2 py-2">
                <select className="rounded border border-slate-200 px-1.5 py-0.5 text-sm" value={u.role} onChange={(e) => { a.setUser(u.id, { role: e.target.value as Role }); toast(`${u.name} 改為${ROLE_LABEL[e.target.value as Role]}`) }}>
                  {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </td>
              <td className="px-2 py-2">
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input type="checkbox" className="accent-brand" checked={u.active} onChange={(e) => { a.setUser(u.id, { active: e.target.checked }); toast(`${u.name} 已${e.target.checked ? '啟用' : '停用'}`) }} />
                  {u.active ? <Badge tone="green">啟用</Badge> : <Badge tone="gray">停用</Badge>}
                </label>
              </td>
              <td className="px-2 py-2 text-xs text-ink-muted">{fmtTime(u.lastLogin)}</td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title="角色權限">
        <Table head={['功能', ...Object.values(ROLE_LABEL)]}>
          {PERMS.map(([f, r]) => (
            <tr key={f}>
              <td className="px-2 py-2">{f}</td>
              {(Object.keys(ROLE_LABEL) as Role[]).map((k) => (
                <td key={k} className={`px-2 py-2 ${r[k] === '✓' ? 'font-bold text-brand' : 'text-ink-faint'}`}>{r[k]}</td>
              ))}
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  )
}
