import { groupBySeatCategory } from './seatCategorySummary'
import type { AllocationContext, SeatZone } from '../types'

export type DaySaleRecord = {
  id: string
  event_slug: string
  seat_id: string
  label: string
  category: string | null
  zone: SeatZone
  allocation: AllocationContext
  note: string | null
  sold_at: string
}

const STORAGE_KEY = 'seat-map-day-sales-v1'

function loadAll(): DaySaleRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as DaySaleRecord[]
  } catch {
    /* ignore */
  }
  return []
}

function saveAll(records: DaySaleRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

export function appendDaySale(
  entry: Omit<DaySaleRecord, 'id' | 'sold_at'> & { sold_at?: string },
): DaySaleRecord {
  const record: DaySaleRecord = {
    ...entry,
    id: crypto.randomUUID(),
    sold_at: entry.sold_at ?? new Date().toISOString(),
  }
  const all = loadAll()
  all.push(record)
  saveAll(all)
  window.dispatchEvent(new CustomEvent('seat-map-day-sales-changed'))
  return record
}

export function listDaySales(eventSlug?: string): DaySaleRecord[] {
  const all = loadAll()
  if (!eventSlug) return [...all].sort((a, b) => b.sold_at.localeCompare(a.sold_at))
  return all
    .filter((r) => r.event_slug === eventSlug)
    .sort((a, b) => b.sold_at.localeCompare(a.sold_at))
}

export function countDaySales(eventSlug: string): number {
  return listDaySales(eventSlug).length
}

export function daySalesByZone(eventSlug: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of listDaySales(eventSlug)) {
    out[r.zone] = (out[r.zone] ?? 0) + 1
  }
  return out
}

export function groupDaySalesByCategory(
  records: DaySaleRecord[],
): { category: string; count: number }[] {
  return groupBySeatCategory(records)
}

/** 席種（category）ごとの当日券販売数 */
export function daySalesByCategory(
  eventSlug: string,
): { category: string; count: number }[] {
  return groupDaySalesByCategory(listDaySales(eventSlug))
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function daySalesToCsv(records: DaySaleRecord[]): string {
  const header = ['試合slug', '席', '券種', 'ゾーン', '在庫区分', '販売日時', 'メモ']
  const rows = records.map((r) =>
    [
      r.event_slug,
      r.label,
      r.category ?? '',
      r.zone,
      r.allocation,
      r.sold_at,
      r.note ?? '',
    ]
      .map(csvEscape)
      .join(','),
  )
  const summary = groupDaySalesByCategory(records)
  const summaryRows =
    summary.length === 0
      ? []
      : [
          '',
          '席種別集計',
          ['券種', '枚数'].map(csvEscape).join(','),
          ...summary.map(({ category, count }) =>
            [category, String(count)].map(csvEscape).join(','),
          ),
        ]
  return `\uFEFF${header.join(',')}\n${rows.join('\n')}${summaryRows.length ? `\n${summaryRows.join('\n')}` : ''}`
}

export function downloadCsvBlob(content: string, filename: string) {
  const blob = new Blob([content], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadDaySalesCsv(records: DaySaleRecord[], filename: string) {
  downloadCsvBlob(daySalesToCsv(records), filename)
}
