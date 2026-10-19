import type { Seat, SeatZone, VenueEvent } from '../types'

export type SeatCatalogFile = {
  slug: string
  map_width: number
  map_height: number
  seat_count: number
  seats: Omit<Seat, 'event_id'>[]
}

const cache = new Map<string, SeatCatalogFile>()

export async function loadSeatCatalog(slug: string): Promise<SeatCatalogFile | null> {
  if (cache.has(slug)) return cache.get(slug)!
  try {
    const res = await fetch(`/seats/${slug}.json`)
    if (!res.ok) return null
    const data = (await res.json()) as SeatCatalogFile
    cache.set(slug, data)
    return data
  } catch {
    return null
  }
}

export function applyCatalogToEvent(
  event: VenueEvent,
  catalog: SeatCatalogFile,
): VenueEvent {
  return {
    ...event,
    map_width: catalog.map_width,
    map_height: catalog.map_height,
  }
}

export function catalogSeatsForEvent(
  eventId: string,
  catalog: SeatCatalogFile,
): Seat[] {
  return catalog.seats.map((s) => ({
    ...s,
    event_id: eventId,
    zone: (s.zone ?? 'floor1') as SeatZone,
    sellable:
      s.sellable ??
      (s.zone !== 'floor2' && s.zone !== 'team_ticket'),
  }))
}

const LAYOUT_KEY = 'seat-map-layout-overrides'

type LayoutOverrides = Record<string, Pick<Seat, 'x' | 'y' | 'w' | 'h'>>

export function loadLayoutOverrides(): LayoutOverrides {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (raw) return JSON.parse(raw) as LayoutOverrides
  } catch {
    /* ignore */
  }
  return {}
}

export function saveLayoutOverride(
  seatId: string,
  geom: Pick<Seat, 'x' | 'y' | 'w' | 'h'>,
) {
  const all = loadLayoutOverrides()
  all[seatId] = geom
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(all))
  window.dispatchEvent(new CustomEvent('seat-map-layout-changed'))
}

export function mergeLayoutOverrides(seats: Seat[]): Seat[] {
  const overrides = loadLayoutOverrides()
  return seats.map((s) => ({
    ...s,
    ...(overrides[s.id] ?? {}),
  }))
}

const MANUAL_KEY = 'seat-map-manual-seats'

export function loadManualSeats(eventId: string): Seat[] {
  try {
    const raw = localStorage.getItem(MANUAL_KEY)
    if (!raw) return []
    const all = JSON.parse(raw) as Record<string, Seat[]>
    return all[eventId] ?? []
  } catch {
    return []
  }
}

export function addManualSeat(seat: Seat) {
  const raw = localStorage.getItem(MANUAL_KEY)
  const all: Record<string, Seat[]> = raw ? JSON.parse(raw) : {}
  const list = all[seat.event_id] ?? []
  list.push(seat)
  all[seat.event_id] = list
  localStorage.setItem(MANUAL_KEY, JSON.stringify(all))
  window.dispatchEvent(new CustomEvent('seat-map-layout-changed'))
}

export async function seatsForEvent(eventId: string, slug: string): Promise<Seat[]> {
  const catalog = await loadSeatCatalog(slug)
  const base = catalog ? catalogSeatsForEvent(eventId, catalog) : []
  const manual = loadManualSeats(eventId)
  return mergeLayoutOverrides([...base, ...manual])
}
