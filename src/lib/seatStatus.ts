import type { AllocationContext, Seat, SeatStatus } from '../types'

export const STATUS_LABELS: Record<SeatStatus, string> = {
  available: '未販売（案内可）',
  presold: '前売り済',
  daysold: '当日券販売済',
  hold: '押さえ',
  blocked: '—',
}

/** スタッフが手動で選べる状態（前売りは CSV 取込のみ） */
export const STAFF_STATUSES: SeatStatus[] = [
  'available',
  'daysold',
  'hold',
]

export function statusLabelForDisplay(
  status: SeatStatus,
  opts?: { staff?: boolean },
): string {
  if (opts?.staff && status === 'presold') {
    return '前売り済（CSV）'
  }
  return STATUS_LABELS[status]
}

export function isSeatSellable(seat: Pick<Seat, 'sellable' | 'zone'>): boolean {
  if (seat.sellable === false) return false
  if (seat.zone === 'floor2' || seat.zone === 'team_ticket') return false
  return true
}

export function isSold(status: SeatStatus): boolean {
  return status === 'presold' || status === 'daysold'
}

/** 空席は一切色を付けない。案内モードのみピンク枠。販売済は薄灰 */
export function seatOverlayClass(
  seat: Pick<Seat, 'sellable' | 'zone'>,
  status: SeatStatus,
  highlightAvailableOnly: boolean,
  _isStaff: boolean,
): string {
  const base = 'seat-hit-target m-0 p-0 shadow-none outline-none'

  if (!isSeatSellable(seat)) {
    return `${base} pointer-events-none opacity-0`
  }

  if (highlightAvailableOnly && status === 'available') {
    return `${base} z-20 box-border border-2 border-incare-floor1 bg-transparent opacity-100`
  }

  switch (status) {
    case 'available':
      return `${base} border-0 bg-transparent opacity-0`
    case 'presold':
    case 'daysold':
      return `${base} border-0 bg-[rgba(127,127,127,0.55)] opacity-100`
    case 'hold':
      return `${base} border border-amber-600/70 bg-amber-500/30 opacity-100`
    case 'blocked':
      return `${base} border-0 bg-transparent opacity-0`
    default:
      return `${base} opacity-0`
  }
}

export function legendSwatchClass(status: SeatStatus): string {
  switch (status) {
    case 'available':
      return 'border border-dashed border-incare-floor1 bg-incare-floor1/15'
    case 'presold':
    case 'daysold':
      return 'bg-[rgba(127,127,127,0.55)] border-0'
    case 'hold':
      return 'bg-amber-500/30 border-amber-600'
    case 'blocked':
      return 'bg-neutral-900/25 border-0'
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
