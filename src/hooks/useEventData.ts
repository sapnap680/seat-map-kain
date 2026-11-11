import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  initialAllocationsForSeat,
  resolveAllocation,
  stateStorageKey,
} from '../lib/allocation'
import { DEMO_EVENTS } from '../lib/demoData'
import {
  clearDemoState,
  loadDemoStates,
  saveDemoState,
} from '../lib/demoStates'
import { isFirebaseConfigured } from '../lib/firebase'
import {
  applyCatalogToEvent,
  addManualSeat,
  loadSeatCatalog,
  mergeLayoutOverrides,
  saveLayoutOverride,
  seatsForEvent,
} from '../lib/seatCatalog'
import {
  clearSoldEntry,
  soldToSeatStates,
  subscribeSeatStatus,
  writeSoldEntry,
} from '../lib/seatStatusDoc'
import {
  defaultSeatState,
  isSeatSellable,
} from '../lib/seatStatus'
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
      const enriched = await Promise.all(
        DEMO_EVENTS.map(async (ev) => {
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

  useEffect(() => {
    if (!eventId || !eventSlug) {
      setSeats([])
      setStates({})
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    const applySeats = () => {
      void loadCatalogSeats(eventSlug, eventId).then((list) => {
        if (!cancelled) setSeats(mergeLayoutOverrides(list))
      })
    }
    applySeats()

    const onLayout = () => applySeats()
    window.addEventListener('seat-map-layout-changed', onLayout)

    if (!isFirebaseConfigured) {
      setStates(loadDemoStates())
      setLoading(false)

      const onState = (e: globalThis.Event) => {
        const st = (e as CustomEvent<SeatState>).detail
        const key = stateStorageKey(st.seat_id, st.allocation)
        setStates((prev) => ({ ...prev, [key]: st }))
      }
      const onClear = (e: globalThis.Event) => {
        const { seatId, allocation } = (
          e as CustomEvent<{ seatId: string; allocation: SeatState['allocation'] }>
        ).detail
        const key = stateStorageKey(seatId, allocation)
        setStates((prev) => {
          if (!(key in prev)) return prev
          const next = { ...prev }
          delete next[key]
          return next
        })
      }
      const onStorage = (e: StorageEvent) => {
        if (e.key === 'seat-map-demo-states') setStates(loadDemoStates())
        if (e.key === 'seat-map-layout-overrides') onLayout()
      }
      window.addEventListener('seat-map-demo-update', onState)
      window.addEventListener('seat-map-demo-clear', onClear)
      window.addEventListener('storage', onStorage)
      return () => {
        cancelled = true
        window.removeEventListener('seat-map-layout-changed', onLayout)
        window.removeEventListener('seat-map-demo-update', onState)
        window.removeEventListener('seat-map-demo-clear', onClear)
        window.removeEventListener('storage', onStorage)
      }
    }

    const unsub = subscribeSeatStatus(
      eventSlug,
      (sold) => {
        if (cancelled) return
        setStates(soldToSeatStates(sold))
        setLoading(false)
      },
      (error) => {
        console.error(error)
        if (!cancelled) setLoading(false)
      },
    )

    return () => {
      cancelled = true
      unsub()
      window.removeEventListener('seat-map-layout-changed', onLayout)
    }
  }, [eventId, eventSlug, loadCatalogSeats])

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
      const key = stateStorageKey(seatId, allocation)

      if (!isFirebaseConfigured || !eventSlug) {
        saveDemoState(updated)
        setStates((prev) => ({ ...prev, [key]: updated }))
        return { error: null }
      }

      const seat = seats.find((s) => s.id === seatId)
      let previous: SeatState | undefined
      setStates((prev) => {
        previous = prev[key]
        return { ...prev, [key]: updated }
      })

      try {
        if (status === 'available' || status === 'blocked') {
          await clearSoldEntry(eventSlug, key)
        } else {
          await writeSoldEntry(eventSlug, key, {
            status,
            note,
            label: seat?.label ?? '',
            category: seat?.category ?? null,
            zone: seat?.zone ?? 'floor1',
          })
        }
        return { error: null }
      } catch (error) {
        setStates((prev) => {
          const next = { ...prev }
          if (previous) next[key] = previous
          else delete next[key]
          return next
        })
        return {
          error: error instanceof Error ? error : new Error(String(error)),
        }
      }
    },
    [eventSlug, seats],
  )

  const clearSeatState = useCallback(
    async (seatId: string, allocation: SeatState['allocation']) => {
      const key = stateStorageKey(seatId, allocation)
      if (!isFirebaseConfigured || !eventSlug) {
        clearDemoState(seatId, allocation)
        setStates((prev) => {
          if (!(key in prev)) return prev
          const next = { ...prev }
          delete next[key]
          return next
        })
        return { error: null }
      }

      try {
        await clearSoldEntry(eventSlug, key)
        setStates((prev) => {
          if (!(key in prev)) return prev
          const next = { ...prev }
          delete next[key]
          return next
        })
        return { error: null }
      } catch (error) {
        return {
          error: error instanceof Error ? error : new Error(String(error)),
        }
      }
    },
    [eventSlug],
  )

  const updateSeatGeometry = useCallback(
    async (seatId: string, geom: Pick<Seat, 'x' | 'y' | 'w' | 'h'>) => {
      const seat = seats.find((s) => s.id === seatId)
      if (!seat) return { error: new Error('seat not found') }
      saveLayoutOverride(seatId, geom)
      setSeats((prev) =>
        prev.map((s) => (s.id === seatId ? { ...s, ...geom } : s)),
      )
      return { error: null }
    },
    [seats],
  )

  const insertSeat = useCallback(
    async (seat: Omit<Seat, 'id'> & { id?: string }) => {
      const id = seat.id ?? crypto.randomUUID()
      const row: Seat = { ...seat, id, zone: seat.zone ?? 'floor1' } as Seat
      addManualSeat(row)
      const slugForSeat =
        DEMO_EVENTS.find((e) => e.id === row.event_id)?.slug ?? eventSlug ?? ''
      for (const allocation of initialAllocationsForSeat(slugForSeat, row.zone)) {
        saveDemoState(defaultSeatState(id, allocation))
      }
      setSeats((prev) => mergeLayoutOverrides([...prev, row]))
      if (!isFirebaseConfigured) setStates(loadDemoStates())
      return { error: null, seat: row }
    },
    [eventSlug],
  )

  const reloadSeats = useCallback(async () => {
    if (!eventId || !eventSlug) return
    setSeats(mergeLayoutOverrides(await loadCatalogSeats(eventSlug, eventId)))
  }, [eventId, eventSlug, loadCatalogSeats])

  return {
    seats,
    seatsWithState,
    states,
    loading,
    upsertSeatState,
    clearSeatState,
    updateSeatGeometry,
    insertSeat,
    reloadSeats,
  }
}
