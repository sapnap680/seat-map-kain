import { seatCategoryLabel } from './seatCategorySummary'
import type { SeatWithState } from '../types'

export function presoldSeatsForEvent(seats: SeatWithState[]): SeatWithState[] {
  return seats
    .filter((s) => s.sellable !== false && s.state.status === 'presold')
    .sort((a, b) => {
      const ca = seatCategoryLabel(a.category)
      const cb = seatCategoryLabel(b.category)
      if (ca !== cb) return ca.localeCompare(cb, 'ja')
      return a.label.localeCompare(b.label, 'ja')
    })
}
