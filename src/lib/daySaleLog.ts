import { groupBySeatCategory } from './seatCategorySummary'
import { isSupabaseConfigured, supabase } from './supabase'
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

type DbDaySaleRow = {
  id: string
  event_slug: string
  seat_id: string
  label: string
  category: string | null
  zone: string
  allocation: AllocationContext
  note: string | null
  sold_at: string
}

function mapRow(row: DbDaySaleRow): DaySaleRecord {
  return {
    id: row.id,
    event_slug: row.event_slug,
    seat_id: row.seat_id,
    label: row.label,
    category: row.category,
    zone: row.zone as SeatZone,
    allocation: row.allocation,
    note: row.note,
    sold_at: row.sold_at,
  }
}

function notifyChange() {
  window.dispatchEvent(new CustomEvent('seat-map-day-sales-changed'))
}

function loadAllLocal(): DaySaleRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as DaySaleRecord[]
  } catch {
    /* ignore */
  }
  return []
}

function saveAllLocal(records: DaySaleRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

function appendLocal(
  entry: Omit<DaySaleRecord, 'id' | 'sold_at'> & { sold_at?: string },
): DaySaleRecord {
  const record: DaySaleRecord = {
    ...entry,
    id: crypto.randomUUID(),
    sold_at: entry.sold_at ?? new Date().toISOString(),
  }
  const all = loadAllLocal()
  all.push(record)
  saveAllLocal(all)
  return record
}

/** 当日券を1件記録（Supabase 優先、未設定時は localStorage） */
export async function appendDaySale(
  entry: Omit<DaySaleRecord, 'id' | 'sold_at'> & { sold_at?: string },
): Promise<{ record: DaySaleRecord; error: Error | null }> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('day_ticket_sales')
      .insert({
        event_slug: entry.event_slug,
        seat_id: entry.seat_id,
        label: entry.label,
        category: entry.category,
        zone: entry.zone,
        allocation: entry.allocation,
        note: entry.note,
      })
      .select()
      .single()

    if (!error && data) {
      const record = mapRow(data as DbDaySaleRow)
      notifyChange()
      return { record, error: null }
    }

    if (error) {
      return { record: appendLocal(entry), error: new Error(error.message) }
    }
  }

  const record = appendLocal(entry)
  notifyChange()
  return { record, error: null }
}

export async function fetchDaySales(
  eventSlug: string,
): Promise<DaySaleRecord[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('day_ticket_sales')
      .select('*')
      .eq('event_slug', eventSlug)
      .order('sold_at', { ascending: false })

    if (!error && data) {
      return (data as DbDaySaleRow[]).map(mapRow)
    }
  }

  return loadAllLocal()
    .filter((r) => r.event_slug === eventSlug)
    .sort((a, b) => b.sold_at.localeCompare(a.sold_at))
}

/** @deprecated 同期読み取り — fetchDaySales を使用 */
export function listDaySales(eventSlug?: string): DaySaleRecord[] {
  const all = loadAllLocal()
  if (!eventSlug) return [...all].sort((a, b) => b.sold_at.localeCompare(a.sold_at))
  return all
    .filter((r) => r.event_slug === eventSlug)
    .sort((a, b) => b.sold_at.localeCompare(a.sold_at))
}

export function groupDaySalesByCategory(
  records: DaySaleRecord[],
): { category: string; count: number }[] {
  return groupBySeatCategory(records)
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
