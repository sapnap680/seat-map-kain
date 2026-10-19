import { useCallback, useEffect, useState } from 'react'
import {
  fetchDaySales,
  type DaySaleRecord,
} from '../lib/daySaleLog'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

export function useDaySales(eventSlug: string | undefined) {
  const [records, setRecords] = useState<DaySaleRecord[]>([])

  const refresh = useCallback(async () => {
    if (!eventSlug) {
      setRecords([])
      return
    }
    setRecords(await fetchDaySales(eventSlug))
  }, [eventSlug])

  useEffect(() => {
    void refresh()
    const onChange = () => void refresh()
    window.addEventListener('seat-map-day-sales-changed', onChange)

    if (!isSupabaseConfigured || !supabase || !eventSlug) {
      return () =>
        window.removeEventListener('seat-map-day-sales-changed', onChange)
    }

    const channel = supabase
      .channel(`day_ticket_sales:${eventSlug}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'day_ticket_sales',
        },
        () => void refresh(),
      )
      .subscribe()

    const client = supabase
    return () => {
      window.removeEventListener('seat-map-day-sales-changed', onChange)
      void client.removeChannel(channel)
    }
  }, [eventSlug, refresh])

  return { records, count: records.length, refresh }
}
