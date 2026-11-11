import { groupBySeatCategory } from './seatCategorySummary'
import { isFirebaseConfigured } from './firebase'
import { stateStorageKey } from './allocation'
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

/** 当日券を1件記録。Firestore では席の保存と同じドキュメントに入る */
export async function appendDaySale(
  entry: Omit<DaySaleRecord, 'id' | 'sold_at'> & { sold_at?: string },
): Promise<{ record: DaySaleRecord; error: Error | null }> {
  if (isFirebaseConfigured) {
    return {
      record: {
        ...entry,
        id: stateStorageKey(entry.seat_id, entry.allocation),
        sold_at: entry.sold_at ?? new Date().toISOString(),
      },
      error: null,
    }
  }

  const record = appendLocal(entry)
  notifyChange()
  return { record, error: null }
}

export async function fetchDaySales(
  eventSlug: string,
): Promise<DaySaleRecord[]> {
  return listDaySales(eventSlug)
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
