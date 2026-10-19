import type { AllocationContext, GenderView, Seat, SeatZone } from '../types'

/** コートサイド・エンド・スペシャルが男女で入れ替わる試合日（slug） */
export const GENDER_SWAP_EVENT_SLUGS = ['2025-12-12', '2025-12-13'] as const

export function eventHasGenderSwap(eventSlug: string): boolean {
  return (GENDER_SWAP_EVENT_SLUGS as readonly string[]).includes(eventSlug)
}

export function isSwappableZone(zone: SeatZone): boolean {
  return zone === 'courtside' || zone === 'end' || zone === 'special'
}

/** 表示・編集に使う在庫キー（1階は常に終日共通） */
export function resolveAllocation(
  eventSlug: string,
  zone: SeatZone,
  genderView: GenderView,
): AllocationContext {
  if (!eventHasGenderSwap(eventSlug)) return 'all_day'
  if (zone === 'floor1' || zone === 'floor2' || zone === 'team_ticket') {
    return 'all_day'
  }
  return genderView
}

export function stateStorageKey(
  seatId: string,
  allocation: AllocationContext,
): string {
  return `${seatId}::${allocation}`
}

export function parseStateStorageKey(key: string): {
  seatId: string
  allocation: AllocationContext
} {
  const [seatId, allocation] = key.split('::')
  if (
    allocation === 'men' ||
    allocation === 'women' ||
    allocation === 'all_day'
  ) {
    return { seatId, allocation }
  }
  return { seatId: key, allocation: 'all_day' }
}

export const ZONE_LABELS: Record<SeatZone, string> = {
  floor1: '1階指定席（終日）',
  floor2: '2階自由席',
  team_ticket: 'チーム券席',
  courtside: 'コートサイド',
  end: 'エンド',
  special: 'スペシャル',
}

export const GENDER_VIEW_LABELS: Record<GenderView, string> = {
  men: '男子',
  women: '女子',
}

/** モーダル・ツールチップ用（1行・短い表記） */
export function seatDisplayTitle(seat: Seat, _eventSlug: string): string {
  if (seat.label && seat.label !== '—') return seat.label
  return seat.label
}

/** 券種付き（詳細行・在庫表示） */
export function seatDisplayWithCategory(seat: Seat): string | null {
  if (!seat.category || !seat.label || seat.label === '—') return null
  return `${seat.category} ${seat.label}`
}

export function allocationDisplayLabel(
  seat: Seat,
  eventSlug: string,
  genderView: GenderView,
  allocation: AllocationContext,
): string {
  const withCat = seatDisplayWithCategory(seat)
  if (withCat) {
    if (eventHasGenderSwap(eventSlug)) {
      if (allocation === 'all_day' || !isSwappableZone(seat.zone)) {
        if (seat.zone === 'floor1') return `${withCat}（終日）`
        return withCat
      }
      return `${GENDER_VIEW_LABELS[genderView]} ${withCat}`
    }
    if (allocation === 'all_day') return withCat
    return `${GENDER_VIEW_LABELS[genderView]} ${withCat}`
  }

  const zoneLabel = ZONE_LABELS[seat.zone]
  if (allocation === 'all_day') {
    if (seat.zone === 'floor1' && eventHasGenderSwap(eventSlug)) {
      return `${zoneLabel}（男女共通・終日）`
    }
    return zoneLabel
  }
  return `${GENDER_VIEW_LABELS[genderView]} / ${zoneLabel}`
}

export function initialAllocationsForSeat(
  eventSlug: string,
  zone: SeatZone,
): AllocationContext[] {
  if (
    !eventHasGenderSwap(eventSlug) ||
    zone === 'floor1' ||
    zone === 'floor2' ||
    zone === 'team_ticket'
  ) {
    return ['all_day']
  }
  if (isSwappableZone(zone)) {
    return ['men', 'women']
  }
  return ['all_day']
}
