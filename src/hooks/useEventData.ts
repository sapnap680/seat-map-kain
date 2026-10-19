import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  initialAllocationsForSeat,
  resolveAllocation,
  stateStorageKey,
} from '../lib/allocation'
import { DEMO_EVENTS } from '../lib/demoData'
import { loadDemoStates, saveDemoState } from '../lib/demoStates'
import {
  defaultSeatState,
  isSeatSellable,
} from '../lib/seatStatus'
import {
  applyCatalogToEvent,
  addManualSeat,
  loadSeatCatalog,
  mergeLayoutOverrides,
  saveLayoutOverride,
  seatsForEvent,
} from '../lib/seatCatalog'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type {
  GenderView,
  Seat,
  SeatState,
  SeatStatus,
  SeatWithState,
  VenueEvent,
} from '../types'

export function useEvents() {
  const [events, setEvents] = useState<VenueEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      let base = isSupabaseConfigured
        ? await (async () => {
            if (!supabase) return DEMO_EVENTS
            const { data, error } = await supabase
              .from('events')
              .select('*')
              .order('slug')
            if (error) console.error(error)
            return (data as VenueEvent[]) ?? DEMO_EVENTS
          })()
        : DEMO_EVENTS

      const enriched = await Promise.all(
        base.map(async (ev) => {
          const catalog = await loadSeatCatalog(ev.slug)
          const merged = catalog ? applyCatalogToEvent(ev, catalog) : ev
          return {
            ...merged,
            pdf_path: merged.pdf_path ?? `/pdfs/${merged.slug}.pdf`,
          }
        }),
      )
      setEvents(enriched)
      setLoading(false)
    }
    void load()
  }, [])

  return { events, loading }
}

export function useSeatMap(
  eventId: string | null,
  eventSlug: string | null,
  genderView: GenderView,
) {
  const [seats, setSeats] = useState<Seat[]>([])
  const [states, setStates] = useState<Record<string, SeatState>>({})
  const [loading, setLoading] = useState(true)

  const loadCatalogSeats = useCallback(async (slug: string, eid: string) => {
    return seatsForEvent(eid, slug)
  }, [])

  const reloadSeats = useCallback(async () => {
    if (!eventId || !eventSlug) return
    if (!isSupabaseConfigured || !supabase) {
      setSeats(await loadCatalogSeats(eventSlug, eventId))
      return
    }
    const { data, error } = await supabase
      .from('seats')
      .select('*')
      .eq('event_id', eventId)
    if (error) console.error(error)
    let list = ((data as Seat[]) ?? []).map((s) => ({
      ...s,
      zone: s.zone ?? 'floor1',
    }))
    if (list.length === 0) {
      list = await loadCatalogSeats(eventSlug, eventId)
    } else {
      list = mergeLayoutOverrides(list)
    }
    setSeats(list)
  }, [eventId, eventSlug, loadCatalogSeats])

  useEffect(() => {
    if (!eventId || !eventSlug) {
      setSeats([])
      setStates({})
      setLoading(false)
      return
    }

    setLoading(true)
    setSeats([])

    if (!isSupabaseConfigured || !supabase) {
      void loadCatalogSeats(eventSlug, eventId).then((s) => {
        setSeats(s)
        setStates(loadDemoStates())
        setLoading(false)
      })

      const onState = (e: globalThis.Event) => {
        const st = (e as CustomEvent<SeatState>).detail
        const key = stateStorageKey(st.seat_id, st.allocation)
        setStates((prev) => ({ ...prev, [key]: st }))
      }
      const onLayout = () => {
        void loadCatalogSeats(eventSlug, eventId).then(setSeats)
      }
      const onStorage = (e: StorageEvent) => {
        if (e.key === 'seat-map-demo-states') setStates(loadDemoStates())
        if (e.key === 'seat-map-layout-overrides') onLayout()
      }
      window.addEventListener('seat-map-demo-update', onState)
      window.addEventListener('seat-map-layout-changed', onLayout)
      window.addEventListener('storage', onStorage)
      return () => {
        window.removeEventListener('seat-map-demo-update', onState)
        window.removeEventListener('seat-map-layout-changed', onLayout)
        window.removeEventListener('storage', onStorage)
      }
    }

    void reloadSeats().then(() => setLoading(false))

    Promise.all([
      supabase.from('seat_states').select('*'),
    ]).then(([statesRes]) => {
      if (statesRes.error) console.error(statesRes.error)
      const map: Record<string, SeatState> = {}
      for (const s of (statesRes.data as SeatState[]) ?? []) {
        const allocation = s.allocation ?? 'all_day'
        map[stateStorageKey(s.seat_id, allocation)] = { ...s, allocation }
      }
      setStates(map)
    })

    const channel = supabase
      .channel(`seat-states-${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seat_states' },
        (payload) => {
          const row = payload.new as SeatState
          if (row?.seat_id) {
            const allocation = row.allocation ?? 'all_day'
            const key = stateStorageKey(row.seat_id, allocation)
            setStates((prev) => ({ ...prev, [key]: { ...row, allocation } }))
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seats' },
        () => {
          void reloadSeats()
        },
      )
      .subscribe()

    return () => {
      void supabase!.removeChannel(channel)
    }
  }, [eventId, eventSlug, loadCatalogSeats, reloadSeats])

  const slug = eventSlug ?? ''

  const seatsWithState: SeatWithState[] = useMemo(() => {
    return seats.map((seat) => {
      const effectiveAllocation = resolveAllocation(slug, seat.zone, genderView)
      const key = stateStorageKey(seat.id, effectiveAllocation)
      const sellable = isSeatSellable(seat)
      const raw =
        states[key] ??
        defaultSeatState(seat.id, effectiveAllocation, sellable)
      const state = sellable
        ? raw
        : {
            ...raw,
            status: 'available' as const,
            note: null,
          }
      return {
        ...seat,
        sellable,
        effectiveAllocation,
        state,
      }
    })
  }, [seats, states, slug, genderView])

  const upsertSeatState = useCallback(
    async (
      seatId: string,
      allocation: SeatState['allocation'],
      status: SeatStatus,
      note: string | null,
    ) => {
      const updated: SeatState = {
        seat_id: seatId,
        allocation,
        status,
        note,
        updated_at: new Date().toISOString(),
      }

      if (!isSupabaseConfigured || !supabase) {
        saveDemoState(updated)
        const key = stateStorageKey(seatId, allocation)
        setStates((prev) => ({ ...prev, [key]: updated }))
        return { error: null }
      }

      const { error } = await supabase
        .from('seat_states')
        .upsert(updated, { onConflict: 'seat_id,allocation' })
      return { error }
    },
    [],
  )

  const updateSeatGeometry = useCallback(
    async (seatId: string, geom: Pick<Seat, 'x' | 'y' | 'w' | 'h'>) => {
      const seat = seats.find((s) => s.id === seatId)
      if (!seat) return { error: new Error('seat not found') }

      if (!isSupabaseConfigured || !supabase) {
        saveLayoutOverride(seatId, geom)
        setSeats((prev) =>
          prev.map((s) => (s.id === seatId ? { ...s, ...geom } : s)),
        )
        return { error: null }
      }

      const { error } = await supabase
        .from('seats')
        .update(geom)
        .eq('id', seatId)
      if (!error) void reloadSeats()
      return { error }
    },
    [seats, reloadSeats],
  )

  const insertSeat = useCallback(
    async (seat: Omit<Seat, 'id'> & { id?: string }) => {
      const id = seat.id ?? crypto.randomUUID()
      const row: Seat = { ...seat, id, zone: seat.zone ?? 'floor1' } as Seat

      if (!isSupabaseConfigured || !supabase) {
        addManualSeat(row)
        const slugForSeat =
          DEMO_EVENTS.find((e) => e.id === row.event_id)?.slug ?? ''
        for (const allocation of initialAllocationsForSeat(
          slugForSeat,
          row.zone,
        )) {
          saveDemoState(defaultSeatState(id, allocation))
        }
        void reloadSeats()
        setStates(loadDemoStates())
        return { error: null, seat: row }
      }

      const { error } = await supabase.from('seats').insert(row)
      if (!error) {
        const { data: ev } = await supabase
          .from('events')
          .select('slug')
          .eq('id', row.event_id)
          .single()
        const eventSlugForSeat = (ev?.slug as string) ?? ''
        const rows = initialAllocationsForSeat(eventSlugForSeat, row.zone).map(
          (a) => defaultSeatState(id, a),
        )
        await supabase.from('seat_states').upsert(rows, {
          onConflict: 'seat_id,allocation',
        })
        void reloadSeats()
      }
      return { error, seat: row }
    },
    [reloadSeats],
  )

  return {
    seats,
    seatsWithState,
    states,
    loading,
    upsertSeatState,
    updateSeatGeometry,
    insertSeat,
    reloadSeats,
  }
}
