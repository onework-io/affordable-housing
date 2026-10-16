// 住宅與建物管理：社區清單、基本資料、模型對應（定位、旋轉、啟用顯示）、新增社區、匯入模型清冊
import { useEffect, useMemo, useState } from 'react'
import { useAdminStore, type CommunityOverride } from '../adminStore'
import { AnchorMap } from '../AnchorMap'
import { Badge, Card, Field, Modal, PageHeader, Table, inputCls, parseCsv, toast } from '../ui'
import { listCommunitiesAll, listUnits } from '@/services/api'
import { rectFootprint } from '@/utils/geo'
import type { Community, LngLat } from '@/types'

type Row = Community & { enabled: boolean }
const DISTRICTS = ['桃園區', '中壢區', '平鎮區', '八德區', '楊梅區', '蘆竹區', '大溪區', '龜山區', '大園區', '觀音區', '新屋區', '龍潭區', '復興區']

function mappingBadge(c: Row) {
  if (!c.model) return <Badge tone="gray">量體示意</Badge>
  return c.model.status === 'confirmed' ? <Badge tone="green">已對應</Badge> : <Badge tone="amber">待確認</Badge>
}

export function Communities() {
  useAdminStore() // 設定變更時重新繪製
  const save = useAdminStore((s) => s.saveCommunity)
  const all = listCommunitiesAll()
  const [district, setDistrict] = useState('')
  const [q, setQ] = useState('')
  const [mapping, setMapping] = useState('')
  const [selId, setSelId] = useState<string>(all[0]?.id ?? '')
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)

  const rows = all.filter(
    (c) =>
      (!district || c.district === district) &&
      (!q || c.name.includes(q) || c.address.includes(q)) &&
      (!mapping || (mapping === 'model' ? !!c.model : mapping === 'massing' ? !c.model : c.model?.status === mapping)),
  )
  const sel = all.find((c) => c.id === selId) ?? null

  return (
    <div className="space-y-4">
      <PageHeader
        title="住宅與建物管理"
        desc="維護社區、建物模型與戶別資料的關聯；設定模型定位與是否在前台圖台顯示。"
        actions={
          <>
            <button className="btn-ghost" data-testid="import-models" onClick={() => setShowImport(true)}>匯入模型清冊</button>
            <button className="btn-primary" data-testid="add-community" onClick={() => setShowAdd(true)}>＋ 新增社區</button>
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <Card>
            <div className="grid gap-3 sm:grid-cols-[160px_1fr_160px]">
              <Field label="行政區">
                <select className={inputCls} value={district} onChange={(e) => setDistrict(e.target.value)}>
                  <option value="">全部</option>
                  {DISTRICTS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="社區名稱或地址">
                <input className={inputCls} placeholder="搜尋社區名稱" value={q} onChange={(e) => setQ(e.target.value)} />
              </Field>
              <Field label="模型對應">
                <select className={inputCls} value={mapping} onChange={(e) => setMapping(e.target.value)}>
                  <option value="">全部</option>
                  <option value="confirmed">已對應</option>
                  <option value="pending">待確認</option>
                  <option value="massing">量體示意（無模型）</option>
                </select>
              </Field>
            </div>
          </Card>
          <Card title={`社區資料清單（${rows.length}）`}>
            <Table head={['社區名稱', '行政區', '戶數／出售中', '模型對應', '前台顯示', '資料來源', '操作']} empty={rows.length === 0}>
              {rows.map((c) => {
                const us = listUnits(c.id)
                return (
                  <tr key={c.id} className={c.id === selId ? 'bg-brand-soft/60' : 'hover:bg-slate-50'}>
                    <td className="px-2 py-2 font-medium">{c.name}</td>
                    <td className="px-2 py-2">{c.district}</td>
                    <td className="px-2 py-2 tabular-nums">{us.length} ／ <span className="text-rose-600">{us.filter((u) => u.status === 'on-sale').length}</span></td>
                    <td className="px-2 py-2">{mappingBadge(c)}</td>
                    <td className="px-2 py-2">{c.enabled ? <Badge tone="green">顯示</Badge> : <Badge tone="gray">隱藏</Badge>}</td>
                    <td className="px-2 py-2 text-ink-muted">{c.id.startsWith('N-') ? '後台新增' : '既有平台（示範）'}</td>
                    <td className="px-2 py-2">
                      <button className="rounded-md border border-brand-line px-2 py-0.5 text-xs font-medium text-brand hover:bg-brand-soft" onClick={() => setSelId(c.id)}>
                        檢視
                      </button>
                    </td>
                  </tr>
                )
              })}
            </Table>
          </Card>
        </div>
        {sel && <Detail key={sel.id} c={sel} onSave={(o) => save(sel.id, o, sel.name)} />}
      </div>
      {showAdd && <AddCommunity onClose={() => setShowAdd(false)} onAdded={(id) => setSelId(id)} />}
      {showImport && <ImportModels onClose={() => setShowImport(false)} />}
    </div>
  )
}

function Detail({ c, onSave }: { c: Row; onSave: (o: CommunityOverride) => void }) {
  const [name, setName] = useState(c.name)
  const [address, setAddress] = useState(c.address)
  const [enabled, setEnabled] = useState(c.enabled)
  const [anchor, setAnchor] = useState<LngLat>(c.model?.anchor ?? c.lngLat)
  const [yaw, setYaw] = useState(c.model?.yaw ?? 0)
  const [altitude, setAltitude] = useState(c.model?.altitude ?? 0)
  const [status, setStatus] = useState(c.model?.status ?? 'pending')
  const [tab, setTab] = useState<'basic' | 'model'>('model')
  const dirty = useMemo(
    () => name !== c.name || address !== c.address || enabled !== c.enabled || (c.model && (anchor[0] !== c.model.anchor[0] || anchor[1] !== c.model.anchor[1] || yaw !== c.model.yaw || altitude !== c.model.altitude || status !== c.model.status)) || (!c.model && (anchor[0] !== c.lngLat[0] || anchor[1] !== c.lngLat[1])),
    [name, address, enabled, anchor, yaw, altitude, status, c],
  )
  useEffect(() => setTab(c.model ? 'model' : 'basic'), [c.model])

  const submit = () => {
    const o: CommunityOverride = { name, address, enabled }
    if (c.model) o.model = { anchor, yaw, altitude, status }
    else o.lngLat = anchor
    onSave(o)
    toast('已儲存設定，回到前台圖台即生效')
  }

  return (
    <Card className="self-start" title={c.name} actions={mappingBadge(c)}>
      <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
        {(['model', 'basic'] as const).map((t) => (
          <button key={t} className={`flex-1 rounded-md py-1.5 ${tab === t ? 'bg-white font-semibold shadow-sm' : 'text-ink-muted'}`} onClick={() => setTab(t)}>
            {t === 'model' ? (c.model ? '模型對應' : '位置設定') : '基本資料'}
          </button>
        ))}
      </div>
      {tab === 'basic' ? (
        <div className="space-y-3">
          <Field label="社區名稱"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="地址"><input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-xs text-ink-muted">行政區</div>{c.district}</div>
            <div><div className="text-xs text-ink-muted">樓層</div>地上 {c.floorsAbove}／地下 {c.floorsBelow}</div>
            <div><div className="text-xs text-ink-muted">基地面積</div>{c.siteArea.toLocaleString()} ㎡</div>
            <div><div className="text-xs text-ink-muted">住宅資料來源</div>既有可負擔住宅平台</div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {c.model && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="模型來源"><input className={`${inputCls} bg-slate-50`} value={c.model.source} readOnly /></Field>
              <Field label="對應狀態">
                <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as 'confirmed' | 'pending')}>
                  <option value="confirmed">已確認</option>
                  <option value="pending">待確認</option>
                </select>
              </Field>
            </div>
          )}
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
              <span>{c.model ? '模型錨點（拖曳綠點調整位置）' : '社區位置（拖曳綠點調整）'}</span>
              <span className="tabular-nums">{anchor[0].toFixed(6)}, {anchor[1].toFixed(6)}</span>
            </div>
            <AnchorMap value={anchor} onChange={setAnchor} radiusM={c.model ? 45 : 30} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="經度"><input type="number" step="0.000001" className={inputCls} value={anchor[0]} onChange={(e) => setAnchor([+e.target.value, anchor[1]])} /></Field>
            <Field label="緯度"><input type="number" step="0.000001" className={inputCls} value={anchor[1]} onChange={(e) => setAnchor([anchor[0], +e.target.value])} /></Field>
          </div>
          {c.model && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={`旋轉角 ${yaw}°`}><input type="range" min={-180} max={180} className="w-full accent-brand" value={yaw} onChange={(e) => setYaw(+e.target.value)} /></Field>
              <Field label="底部高程（公尺）"><input type="number" step="0.1" className={inputCls} value={altitude} onChange={(e) => setAltitude(+e.target.value)} /></Field>
            </div>
          )}
        </div>
      )}
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-brand" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        啟用圖台顯示
      </label>
      <div className="mt-4 flex gap-2">
        <a className="btn-ghost flex-1" href={`#/?focus=${c.id}`}>在前台定位</a>
        <button className="btn-primary flex-1" disabled={!dirty} data-testid="save-community" onClick={submit}>儲存設定</button>
      </div>
    </Card>
  )
}

function AddCommunity({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const add = useAdminStore((s) => s.addCommunity)
  const [f, setF] = useState({ name: '', district: '桃園區', address: '', lng: '121.3045', lat: '24.9975', floors: '12', perFloor: '8', onSale: '6', w: '40', d: '28' })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const lng = +f.lng, lat = +f.lat, floors = Math.round(+f.floors), per = Math.round(+f.perFloor)
  const valid = f.name.trim() && lng > 120 && lng < 122.5 && lat > 21.8 && lat < 25.5 && floors >= 2 && floors <= 60 && per >= 1 && per <= 30
  const submit = () => {
    const id = `N-${Date.now().toString(36)}`
    const c: Community = {
      id, name: f.name.trim(), district: f.district, address: f.address || `桃園市${f.district}（示意位置）`, lngLat: [lng, lat],
      floorsAbove: floors, floorsBelow: 1, siteArea: Math.round(+f.w * +f.d * 2.2),
      towers: [{ id: 'M', label: '', fromFloor: 2, toFloor: floors, unitCodes: Array.from({ length: per }, (_, i) => String(i + 1).padStart(2, '0')) }],
      massing: { footprint: rectFootprint([lng, lat], +f.w, +f.d, 0), floorHeight: 3.2 },
      dataDate: '115.10.16', note: '後台新增（示範），尚未取得 BIM 模型，以量體示意。', demoOnSale: Math.min(+f.onSale || 0, (floors - 1) * per),
    }
    add(c)
    onAdded(id)
    toast(`已新增「${c.name}」，回到前台圖台即可看到`)
    onClose()
  }
  return (
    <Modal title="新增社區" onClose={onClose} footer={<><button className="btn-ghost" onClick={onClose}>取消</button><button className="btn-primary" disabled={!valid} data-testid="confirm-add" onClick={submit}>新增</button></>}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Field label="社區名稱"><input className={inputCls} value={f.name} onChange={set('name')} placeholder="例如：示範社區 B01" /></Field></div>
        <Field label="行政區"><select className={inputCls} value={f.district} onChange={set('district')}>{DISTRICTS.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="地址（選填）"><input className={inputCls} value={f.address} onChange={set('address')} /></Field>
        <Field label="經度"><input className={inputCls} value={f.lng} onChange={set('lng')} /></Field>
        <Field label="緯度"><input className={inputCls} value={f.lat} onChange={set('lat')} /></Field>
        <Field label="地上樓層"><input type="number" className={inputCls} value={f.floors} onChange={set('floors')} /></Field>
        <Field label="每層戶數"><input type="number" className={inputCls} value={f.perFloor} onChange={set('perFloor')} /></Field>
        <Field label="量體寬（公尺）"><input type="number" className={inputCls} value={f.w} onChange={set('w')} /></Field>
        <Field label="量體深（公尺）"><input type="number" className={inputCls} value={f.d} onChange={set('d')} /></Field>
        <div className="col-span-2"><Field label="示範：銷售中戶數" hint="正式版由既有交易平台同步，這裡僅供示範。"><input type="number" className={inputCls} value={f.onSale} onChange={set('onSale')} /></Field></div>
      </div>
    </Modal>
  )
}

function ImportModels({ onClose }: { onClose: () => void }) {
  const save = useAdminStore((s) => s.saveCommunity)
  const log = useAdminStore((s) => s.log)
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [fileName, setFileName] = useState('')
  const all = listCommunitiesAll()
  const matched = rows.filter((r) => all.some((c) => c.id === r['社區代碼']))
  const sample = '社區代碼,經度,緯度,旋轉角,對應狀態\nA11,121.29996,24.994238,0,confirmed'
  const apply = () => {
    for (const r of matched) {
      const c = all.find((x) => x.id === r['社區代碼'])!
      const lngLat: LngLat = [+r['經度'], +r['緯度']]
      if (c.model) save(c.id, { model: { anchor: lngLat, yaw: +(r['旋轉角'] || 0), status: r['對應狀態'] === 'pending' ? 'pending' : 'confirmed' } }, c.name)
      else save(c.id, { lngLat }, c.name)
    }
    log('匯入模型清冊', fileName, `${matched.length} 筆對應成功、${rows.length - matched.length} 筆找不到社區`)
    toast(`已套用 ${matched.length} 筆模型對應`)
    onClose()
  }
  return (
    <Modal title="匯入模型清冊" onClose={onClose} footer={<><button className="btn-ghost" onClick={onClose}>取消</button><button className="btn-primary" disabled={!matched.length} onClick={apply}>套用 {matched.length} 筆</button></>}>
      <p className="text-sm text-ink-muted">上傳 CSV（UTF-8），欄位如下。正式版會一併上傳 BIM／GLB 檔並進行格式、座標與建物識別檢核。</p>
      <pre className="my-3 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs">{sample}</pre>
      <input
        type="file"
        accept=".csv,text/csv"
        className="text-sm"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          setFileName(file.name)
          setRows(parseCsv(await file.text()))
        }}
      />
      {rows.length > 0 && (
        <p className="mt-3 text-sm">
          讀到 {rows.length} 筆，<b className="text-brand">{matched.length}</b> 筆對應到既有社區
          {rows.length > matched.length && <span className="text-amber-700">，{rows.length - matched.length} 筆找不到社區代碼</span>}。
        </p>
      )}
    </Modal>
  )
}
