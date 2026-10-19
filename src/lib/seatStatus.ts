import type { AllocationContext, Seat, SeatStatus } from '../types'

export const STATUS_LABELS: Record<SeatStatus, string> = {
  available: '案内可',
  presold: '前売り済',
  daysold: '当日券販売済',
  hold: '押さえ',
  blocked: '—',
}

export function statusLabelForDisplay(status: SeatStatus): string {
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
  /** 透明クリック用（.seat-hit-target が border/bg を消すため、見える席には付けない） */
  const hit = 'seat-hit-target m-0 p-0 shadow-none outline-none'
  const visible = 'seat-overlay m-0 box-border p-0 shadow-none outline-none'

  if (!isSeatSellable(seat)) {
    return `${hit} pointer-events-none opacity-0`
  }

  if (highlightAvailableOnly && status === 'available') {
    return `${visible} z-20 border-2 border-incare-floor1 bg-incare-floor1/10 opacity-100`
  }

  if (highlightAvailableOnly && isSold(status)) {
    return `${visible} border-0 bg-[rgba(127,127,127,0.35)] opacity-35`
  }

  switch (status) {
    case 'available':
      return `${hit} border-0 bg-transparent opacity-0`
    case 'presold':
    case 'daysold':
      return `${visible} border-0 bg-[rgba(127,127,127,0.55)] opacity-100`
    case 'hold':
      return `${visible} border border-amber-600/70 bg-amber-500/30 opacity-100`
    case 'blocked':
      return `${hit} border-0 bg-transparent opacity-0`
    default:
      return `${hit} opacity-0`
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
