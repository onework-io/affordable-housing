// 示範社區（PoC 假資料）。正式版由「既有住宅平台」API 介接，模型對應由後台維護。
// 座標為示意位置（桃園區市中心的空地，避開既有建物與道路），非實際基地。
import type { Community } from '@/types'
import { rectFootprint } from '@/utils/geo'

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

export const COMMUNITIES: Community[] = [
  {
    id: 'A11',
    name: '示範社區 A11',
    district: '桃園區',
    address: '桃園市桃園區（示意位置）',
    lngLat: [121.300376, 24.994436],
    floorsAbove: 33,
    floorsBelow: 2,
    siteArea: 5102.99,
    towers: [
      { id: 'T1', label: 'A 棟', fromFloor: 3, toFloor: 33, unitCodes: ['A1', 'A2', 'A3', 'A4'] },
      { id: 'T2', label: 'B 棟', fromFloor: 3, toFloor: 33, unitCodes: ['B1', 'B2'] },
    ],
    model: {
      manifestUrl: `${import.meta.env.BASE_URL}models/hk/manifest.json`,
      baseUrl: `${import.meta.env.BASE_URL}models/hk/`,
      anchor: [121.29996, 24.994238], // 模型局部原點；雙塔占原點以東約 83 m、以北約 44 m
      yaw: 0,
      altitude: 0,
      status: 'confirmed',
      source: 'PoC 社區',
    },
    dataDate: '115.10.07',
    note: '3D 為 PoC 替代模型（雙塔 33 層），樓層與戶數依模型設定，非本案實際建物。',
  },
  {
    id: 'A18-1',
    name: '示範社區 A18-1',
    district: '桃園區',
    address: '桃園市桃園區（示意位置）',
    lngLat: [121.304153, 24.993736],
    floorsAbove: 13,
    floorsBelow: 2,
    siteArea: 6820.4,
    towers: [{ id: 'M', label: '', fromFloor: 2, toFloor: 13, unitCodes: range(1, 17).map((n) => String(n).padStart(2, '0')) }],
    massing: { footprint: rectFootprint([121.304153, 24.993736], 60, 32, 0), floorHeight: 3.2 },
    dataDate: '115.10.07',
    note: '尚未取得 BIM 模型，以量體示意。',
  },
  {
    id: 'A18-2',
    name: '示範社區 A18-2',
    district: '桃園區',
    address: '桃園市桃園區（示意位置）',
    lngLat: [121.297887, 24.992958],
    floorsAbove: 16,
    floorsBelow: 1,
    siteArea: 3911.2,
    towers: [{ id: 'M', label: '', fromFloor: 2, toFloor: 16, unitCodes: range(1, 7).map((n) => String(n).padStart(2, '0')) }],
    massing: { footprint: rectFootprint([121.297887, 24.992958], 42, 26, 0), floorHeight: 3.2 },
    dataDate: '115.10.07',
    note: '尚未取得 BIM 模型，以量體示意。',
  },
  {
    id: 'A21',
    name: '示範社區 A21',
    district: '桃園區',
    address: '桃園市桃園區（示意位置）',
    lngLat: [121.3068, 24.9978],
    floorsAbove: 12,
    floorsBelow: 2,
    siteArea: 5240.6,
    towers: [{ id: 'M', label: '', fromFloor: 2, toFloor: 12, unitCodes: range(1, 9).map((n) => String(n).padStart(2, '0')) }],
    massing: { footprint: rectFootprint([121.3068, 24.9978], 48, 30, 0), floorHeight: 3.2 },
    dataDate: '115.10.07',
    note: '尚未取得 BIM 模型，以量體示意。',
  },
  {
    id: 'A23',
    name: '示範社區 A23',
    district: '桃園區',
    address: '桃園市桃園區（示意位置）',
    lngLat: [121.2938, 24.9885],
    floorsAbove: 18,
    floorsBelow: 3,
    siteArea: 4105.9,
    towers: [{ id: 'M', label: '', fromFloor: 2, toFloor: 18, unitCodes: range(1, 7).map((n) => String(n).padStart(2, '0')) }],
    massing: { footprint: rectFootprint([121.2938, 24.9885], 36, 34, 0), floorHeight: 3.2 },
    dataDate: '115.10.07',
    note: '尚未取得 BIM 模型，以量體示意。',
  },
]

/** 各社區平台列出售中戶數（示範：與簡報一致） */
export const ON_SALE_TARGET: Record<string, number> = { A11: 15, 'A18-1': 20, 'A18-2': 2, A21: 12, A23: 9 }
