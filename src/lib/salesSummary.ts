import type { DaySaleRecord } from './daySaleLog'
import { groupBySeatCategory, seatCategoryLabel } from './seatCategorySummary'
import { formatTicketPrice, ticketPriceYen } from './ticketPricing'
import type { SeatWithState } from '../types'

export type SalesSummaryRow = {
  category: string
  count: number
  unitYen: number | null
  subtotalYen: number
  hasUnknownPrice: boolean
}

export type SalesSummary = {
  rows: SalesSummaryRow[]
  totalSeats: number
  totalYen: number
  hasUnknownPrice: boolean
}

function collectPriced(
  items: { categoryLabel: string; unit: number | null }[],
): SalesSummary {
  const buckets = new Map<
    string,
    { count: number; subtotal: number; units: Set<number>; missing: number }
  >()
  for (const { categoryLabel, unit } of items) {
    let b = buckets.get(categoryLabel)
    if (!b) {
      b = { count: 0, subtotal: 0, units: new Set(), missing: 0 }
      buckets.set(categoryLabel, b)
    }
    b.count += 1
    if (unit == null) b.missing += 1
    else {
      b.subtotal += unit
      b.units.add(unit)
    }
  }
  const order = groupBySeatCategory(
    [...buckets.keys()].map((category) => ({ category })),
  ).map((r) => r.category)

  let totalSeats = 0
  let totalYen = 0
  let hasUnknownPrice = false
  const rows: SalesSummaryRow[] = []
  for (const category of order) {
    const b = buckets.get(category)!
    const unknown = b.missing > 0 || b.units.size > 1
    if (unknown) hasUnknownPrice = true
    totalSeats += b.count
    totalYen += b.subtotal
    rows.push({
      category,
      count: b.count,
      unitYen: b.units.size === 1 ? [...b.units][0]! : null,
      subtotalYen: b.subtotal,
      hasUnknownPrice: unknown,
    })
  }
  return { rows, totalSeats, totalYen, hasUnknownPrice }
}

export function summarizeDaySales(
  eventSlug: string,
  records: DaySaleRecord[],
): SalesSummary {
  return collectPriced(
    records.map((r) => ({
      categoryLabel: seatCategoryLabel(r.category),
      unit: ticketPriceYen(eventSlug, {
        zone: r.zone,
        category: r.category ?? undefined,
        section: null,
      }),
    })),
  )
}

export function summarizePresoldSeats(
  eventSlug: string,
  seats: SeatWithState[],
): SalesSummary {
  return collectPriced(
    seats.map((s) => ({
      categoryLabel: seatCategoryLabel(s.category),
      unit: ticketPriceYen(eventSlug, s),
    })),
  )
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function salesSummaryToCsv(
  title: string,
  summary: SalesSummary,
): string {
  const header = ['区分', '券種', '枚数', '単価', '小計']
  const rows = summary.rows.map((r) =>
    [
      title,
      r.category,
      String(r.count),
      r.unitYen != null ? String(r.unitYen) : '',
      String(r.subtotalYen),
    ]
      .map(csvEscape)
      .join(','),
  )
  const totalRow = [
    title,
    '合計',
    String(summary.totalSeats),
    '',
    String(summary.totalYen),
  ]
    .map(csvEscape)
    .join(',')
  return `\uFEFF${header.join(',')}\n${rows.join('\n')}\n${totalRow}`
}

export { formatTicketPrice }
