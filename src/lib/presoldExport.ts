import { downloadCsvBlob } from './daySaleLog'
import { groupBySeatCategory, seatCategoryLabel } from './seatCategorySummary'
import type { SeatWithState } from '../types'

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

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

export function presoldToCsv(
  seats: SeatWithState[],
  eventSlug: string,
): string {
  const rows = presoldSeatsForEvent(seats)
  const header = [
    '試合slug',
    '席',
    '券種',
    'ゾーン',
    '在庫区分',
    '更新日時',
    'メモ',
  ]
  const detail = rows.map((s) =>
    [
      eventSlug,
      s.label,
      s.category ?? '',
      s.zone,
      s.effectiveAllocation,
      s.state.updated_at,
      s.state.note ?? '',
    ]
      .map(csvEscape)
      .join(','),
  )
  const summary = groupBySeatCategory(rows)
  const summaryRows =
    summary.length === 0
      ? []
      : [
          '',
          '席種別集計',
          ['券種', '枚数'].map(csvEscape).join(','),
          ...summary.map(({ category, count }) =>
            [category, String(count)].map(csvEscape).join(','),
          ),
        ]
  return `\uFEFF${header.join(',')}\n${detail.join('\n')}${summaryRows.length ? `\n${summaryRows.join('\n')}` : ''}`
}

export function downloadPresoldCsv(
  seats: SeatWithState[],
  eventSlug: string,
  filename: string,
) {
  downloadCsvBlob(presoldToCsv(seats, eventSlug), filename)
}
