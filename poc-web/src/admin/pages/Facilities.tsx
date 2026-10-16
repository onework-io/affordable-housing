// 生活設施圖層：類別啟用、匯入設施（CSV）、設施清單
import { useState } from 'react'
import { useAdminStore } from '../adminStore'
import { Badge, Card, Field, PageHeader, Table, inputCls, parseCsv, toast } from '../ui'
import { CATEGORY, CATEGORY_KEYS } from '@/config/lifeCircle'
import { listFacilities } from '@/services/api'
import type { Facility, FacilityCategory } from '@/types'

const LABEL_TO_KEY = Object.fromEntries(CATEGORY_KEYS.map((k) => [CATEGORY[k].label, k])) as Record<string, FacilityCategory>

export function Facilities() {
  const a = useAdminStore()
  const all = listFacilities(true)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [preview, setPreview] = useState<{ name: string; ok: Facility[]; bad: number } | null>(null)
  const list = all.filter((f) => (!cat || f.category === cat) && (!q || f.name.includes(q)))

  const onFile = async (file: File) => {
    const rows = parseCsv(await file.text())
    const ok: Facility[] = []
    let bad = 0
    rows.forEach((r, i) => {
      const key = LABEL_TO_KEY[r['類別']] ?? (CATEGORY_KEYS.includes(r['類別'] as FacilityCategory) ? (r['類別'] as FacilityCategory) : undefined)
      const lng = +r['經度'], lat = +r['緯度']
      if (!key || !r['名稱'] || !(lng > 119 && lng < 123 && lat > 21 && lat < 26)) { bad++; return }
      ok.push({ id: `IMP-${Date.now().toString(36)}-${i}`, category: key, name: r['名稱'], lngLat: [lng, lat] })
    })
    setPreview({ name: file.name, ok, bad })
  }

  return (
    <div className="space-y-4">
      <PageHeader title="生活設施圖層" desc="管理前台可顯示的設施類別，並匯入生活設施資料（正式版介接政府開放資料、TDX 等來源）。" />
      <Card title="設施類別">
        <Table head={['類別', '圖示', '筆數', '後台匯入', '資料來源', '前台顯示']}>
          {CATEGORY_KEYS.map((k) => {
            const n = all.filter((f) => f.category === k).length
            const imp = a.importedFacilities.filter((f) => f.category === k).length
            return (
              <tr key={k}>
                <td className="px-2 py-2 font-medium">{CATEGORY[k].label}</td>
                <td className="px-2 py-2"><span className="inline-grid h-6 w-6 place-items-center rounded-full text-xs font-bold text-white" style={{ background: `rgb(${CATEGORY[k].color.join(',')})` }}>{CATEGORY[k].glyph}</span></td>
                <td className="px-2 py-2 tabular-nums">{n}</td>
                <td className="px-2 py-2 tabular-nums">{imp || '—'}</td>
                <td className="px-2 py-2 text-ink-muted">示範資料{imp ? '＋CSV 匯入' : ''}</td>
                <td className="px-2 py-2">
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input type="checkbox" className="accent-brand" data-testid={`cat-${k}`} checked={a.categoryEnabled[k] !== false} onChange={(e) => { a.setCategoryEnabled(k, e.target.checked, CATEGORY[k].label); toast(`${CATEGORY[k].label}已${e.target.checked ? '啟用' : '停用'}`) }} />
                    {a.categoryEnabled[k] !== false ? <Badge tone="green">顯示</Badge> : <Badge tone="gray">停用</Badge>}
                  </label>
                </td>
              </tr>
            )
          })}
        </Table>
      </Card>
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card title="匯入生活設施（CSV）">
          <p className="text-sm text-ink-muted">欄位：名稱、類別、經度、緯度。類別可填 醫療／商業／學校／公園綠地／交通設施／公共設施。</p>
          <pre className="my-3 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs">{'名稱,類別,經度,緯度\n桃園市立圖書館總館,公共設施,121.3017,24.9932'}</pre>
          <input type="file" accept=".csv,text/csv" className="text-sm" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          {preview && (
            <div className="mt-3 space-y-2 text-sm">
              <p>
                {preview.name}：可匯入 <b className="text-brand">{preview.ok.length}</b> 筆
                {preview.bad > 0 && <span className="text-amber-700">，{preview.bad} 筆欄位不完整或座標超出範圍</span>}
              </p>
              <button className="btn-primary w-full" disabled={!preview.ok.length} onClick={() => { a.importFacilities(preview.ok, preview.name); toast(`已匯入 ${preview.ok.length} 筆設施`); setPreview(null) }}>
                匯入 {preview.ok.length} 筆
              </button>
            </div>
          )}
          {a.importedFacilities.length > 0 && (
            <button className="mt-3 text-xs text-rose-600 underline" onClick={() => { a.clearImportedFacilities(); toast('已清除匯入的設施') }}>
              清除全部匯入設施（{a.importedFacilities.length} 筆）
            </button>
          )}
        </Card>
        <Card title={`設施清單（${list.length}）`}>
          <div className="mb-3 grid gap-3 sm:grid-cols-[160px_1fr]">
            <Field label="類別">
              <select className={inputCls} value={cat} onChange={(e) => setCat(e.target.value)}>
                <option value="">全部</option>
                {CATEGORY_KEYS.map((k) => <option key={k} value={k}>{CATEGORY[k].label}</option>)}
              </select>
            </Field>
            <Field label="名稱"><input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋設施名稱" /></Field>
          </div>
          <Table head={['名稱', '類別', '經緯度', '來源']} empty={list.length === 0}>
            {list.slice(0, 60).map((f) => (
              <tr key={f.id}>
                <td className="px-2 py-1.5">{f.name}</td>
                <td className="px-2 py-1.5">{CATEGORY[f.category].label}</td>
                <td className="px-2 py-1.5 text-xs tabular-nums text-ink-muted">{f.lngLat[0].toFixed(5)}, {f.lngLat[1].toFixed(5)}</td>
                <td className="px-2 py-1.5">{f.id.startsWith('IMP-') ? <Badge tone="blue">匯入</Badge> : <Badge tone="gray">示範</Badge>}</td>
              </tr>
            ))}
          </Table>
          {list.length > 60 && <p className="mt-2 text-xs text-ink-faint">只顯示前 60 筆。</p>}
        </Card>
      </div>
    </div>
  )
}
