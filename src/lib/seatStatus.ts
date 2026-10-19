import type { AllocationContext, Seat, SeatStatus } from '../types'

export const STATUS_LABELS: Record<SeatStatus, string> = {
  available: '空席（PDFの色そのまま）',
  presold: '前売り済',
  daysold: '当日販売済',
  hold: '押さえ',
  blocked: '使用不可',
}

export const STAFF_STATUSES: SeatStatus[] = [
  'available',
  'presold',
  'daysold',
  'hold',
  'blocked',
]

export function isSeatSellable(seat: Pick<Seat, 'sellable' | 'zone'>): boolean {
  if (seat.sellable === false) return false
  if (seat.zone === 'floor2' || seat.zone === 'team_ticket') return false
  return true
}

export function isSold(status: SeatStatus): boolean {
  return status === 'presold' || status === 'daysold'
}

/** 空席はオーバーレイなし。販売済などだけ薄く重ねる */
export function seatOverlayClass(
  seat: Pick<Seat, 'sellable' | 'zone'>,
  status: SeatStatus,
  highlightAvailableOnly: boolean,
  isStaff: boolean,
): string {
  const base = 'seat-hit-target m-0 p-0 shadow-none outline-none'

  if (!isSeatSellable(seat)) {
    return `${base} pointer-events-none border-0 opacity-0`
  }

  if (highlightAvailableOnly) {
    if (status === 'available') {
      return `${base} z-20 box-border border-2 border-emerald-500 bg-transparent opacity-100`
    }
    return `${base} pointer-events-none opacity-0`
  }

  if (status === 'available') {
    if (isStaff) {
      return `${base} border-0 bg-transparent opacity-0 hover:opacity-100 hover:ring-1 hover:ring-blue-400/80`
    }
    return `${base} border-0 bg-transparent opacity-0`
  }

  switch (status) {
    case 'presold':
    case 'daysold':
      return `${base} border-0 bg-neutral-700/45 opacity-100`
    case 'hold':
      return `${base} border border-amber-600/70 bg-amber-500/30 opacity-100`
    case 'blocked':
      return `${base} border-0 bg-neutral-900/30 opacity-100`
    default:
      return `${base} opacity-0`
  }
}

export function legendSwatchClass(status: SeatStatus): string {
  switch (status) {
    case 'available':
      return 'border border-dashed border-slate-400 bg-transparent'
    case 'presold':
    case 'daysold':
      return 'bg-neutral-700/45 border-0'
    case 'hold':
      return 'bg-amber-500/30 border-amber-600'
    case 'blocked':
      return 'bg-neutral-900/30 border-0'
    default:
      return 'bg-white border-gray-400'
  }
}

export function defaultSeatState(
  seatId: string,
  allocation: AllocationContext = 'all_day',
  sellable = true,
) {
  return {
    seat_id: seatId,
    allocation,
    status: (sellable ? 'available' : 'blocked') as SeatStatus,
    note: sellable ? null : ('販売対象外' as string | null),
    updated_at: new Date().toISOString(),
  }
}
