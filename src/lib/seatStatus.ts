import type { AllocationContext, SeatStatus } from '../types'

export const STATUS_LABELS: Record<SeatStatus, string> = {
  available: '空席（案内可）',
  presold: '前売り済',
  daysold: '当日販売済',
  hold: '押さえ',
  blocked: '使用不可',
}

export const ALL_STATUSES: SeatStatus[] = [
  'available',
  'presold',
  'daysold',
  'hold',
  'blocked',
]

export function isSold(status: SeatStatus): boolean {
  return status === 'presold' || status === 'daysold'
}

export function seatFillClass(status: SeatStatus): string {
  switch (status) {
    case 'available':
      return 'border-emerald-600/80 bg-emerald-400/25 hover:bg-emerald-400/40'
    case 'presold':
    case 'daysold':
      return 'bg-gray-400 border-gray-500 opacity-90'
    case 'hold':
      return 'bg-amber-300 border-amber-600'
    case 'blocked':
      return 'bg-slate-700 border-slate-900'
    default:
      return 'bg-white border-gray-400'
  }
}

export function legendSwatchClass(status: SeatStatus): string {
  switch (status) {
    case 'available':
      return 'bg-emerald-100 border-emerald-500'
    case 'presold':
    case 'daysold':
      return 'bg-gray-400 border-gray-500'
    case 'hold':
      return 'bg-amber-300 border-amber-600'
    case 'blocked':
      return 'bg-slate-700 border-slate-900'
    default:
      return 'bg-white border-gray-400'
  }
}

export function defaultSeatState(
  seatId: string,
  allocation: AllocationContext = 'all_day',
) {
  return {
    seat_id: seatId,
    allocation,
    status: 'available' as SeatStatus,
    note: null as string | null,
    updated_at: new Date().toISOString(),
  }
}
