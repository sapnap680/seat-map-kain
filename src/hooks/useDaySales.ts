import { useEffect, useState } from 'react'
import { parseStateStorageKey } from '../lib/allocation'
import { isFirebaseConfigured } from '../lib/firebase'
import { listDaySales, type DaySaleRecord } from '../lib/daySaleLog'
import { getCachedSold, subscribeSeatStatus, type SoldEntry } from '../lib/seatStatusDoc'

function recordsFromSold(
  eventSlug: string,
  sold: Record<string, SoldEntry>,
): DaySaleRecord[] {
  return Object.entries(sold)
    .filter(([, entry]) => entry.status === 'daysold')
    .map(([key, entry]) => {
      const parsed = parseStateStorageKey(key)
      return {
        id: key,
        event_slug: eventSlug,
        seat_id: parsed.seatId,
        label: entry.label,
        category: entry.category,
        zone: entry.zone,
        allocation: parsed.allocation,
        note: entry.note,
        sold_at: entry.at,
      }
    })
    .sort((a, b) => b.sold_at.localeCompare(a.sold_at))
}

export function useDaySales(eventSlug: string | undefined) {
  const [records, setRecords] = useState<DaySaleRecord[]>([])

  useEffect(() => {
    if (!eventSlug) {
      setRecords([])
      return
    }

    if (!isFirebaseConfigured) {
      const refresh = () => setRecords(listDaySales(eventSlug))
      refresh()
      window.addEventListener('seat-map-day-sales-changed', refresh)
      return () =>
        window.removeEventListener('seat-map-day-sales-changed', refresh)
    }

    setRecords(recordsFromSold(eventSlug, getCachedSold(eventSlug)))
    return subscribeSeatStatus(eventSlug, (sold) => {
      setRecords(recordsFromSold(eventSlug, sold))
    })
  }, [eventSlug])

  return { records, count: records.length, refresh: () => {} }
}
