import { useEffect, useMemo, useState } from 'react'
import { eventTabLabel, seatDisplayWithCategory } from '../lib/allocation'
import {
  daySalesByCategory,
  downloadDaySalesCsv,
  listDaySales,
  type DaySaleRecord,
} from '../lib/daySaleLog'
import {
  downloadPresoldCsv,
  presoldSeatsForEvent,
} from '../lib/presoldExport'
import { groupBySeatCategory } from '../lib/seatCategorySummary'
import type { SeatWithState, VenueEvent } from '../types'
import { ModalCloseButton } from './ModalCloseButton'

function saleLine(r: DaySaleRecord): string {
  if (r.category) return `${r.category} ${r.label}`
  return r.label
}

function presoldLine(seat: SeatWithState): string {
  return seatDisplayWithCategory(seat) ?? seat.label
}

type Props = {
  open: boolean
  onClose: () => void
  events: VenueEvent[]
  activeSlug: string
  seats: SeatWithState[]
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function CategoryTotals({
  items,
}: {
  items: { category: string; count: number }[]
}) {
  if (items.length === 0) return null
  return (
    <ul className="space-y-1.5 text-sm text-slate-800">
      {items.map(({ category, count }) => (
        <li
          key={category}
          className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
        >
          <span>{category}</span>
          <span className="shrink-0 tabular-nums font-semibold text-blue-700">
            {count} 席
          </span>
        </li>
      ))}
    </ul>
  )
}

export function StaffDaySalesModal({
  open,
  onClose,
  events,
  activeSlug,
  seats,
}: Props) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const onChange = () => setTick((t) => t + 1)
    window.addEventListener('seat-map-day-sales-changed', onChange)
    return () => window.removeEventListener('seat-map-day-sales-changed', onChange)
  }, [])

  const dayRecords = useMemo(() => {
    void tick
    return listDaySales(activeSlug)
  }, [activeSlug, tick])

  const presoldSeats = useMemo(
    () => presoldSeatsForEvent(seats),
    [seats],
  )

  const dayByCategory = useMemo(() => {
    void tick
    return daySalesByCategory(activeSlug)
  }, [activeSlug, tick])

  const presoldByCategory = useMemo(
    () => groupBySeatCategory(presoldSeats),
    [presoldSeats],
  )

  if (!open) return null

  const activeEvent = events.find((e) => e.slug === activeSlug)
  const eventTitle = activeEvent ? eventTabLabel(activeEvent) : activeSlug

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 p-5">
          <div>
            <h2 className="text-lg font-bold text-slate-800">販売の集計</h2>
            <p className="mt-1 text-sm text-slate-600">{eventTitle}</p>
          </div>
          <ModalCloseButton onClose={onClose} />
        </div>

        <div className="space-y-6 overflow-auto p-5">
          <section>
            <h3 className="text-sm font-bold text-slate-800">当日券</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              この端末で「当日券を販売した」と記録した分（取り消ししてもログは残ります）
            </p>
            <p className="mt-2 text-xl font-bold text-slate-800">
              合計{' '}
              <span className="text-blue-700">{dayRecords.length}</span> 席
            </p>
            <div className="mt-2">
              <CategoryTotals items={dayByCategory} />
            </div>
            <div className="mt-3 max-h-36 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-100 text-slate-600">
                  <tr>
                    <th className="p-2">席</th>
                    <th className="p-2">日時</th>
                  </tr>
                </thead>
                <tbody>
                  {dayRecords.length === 0 ? (
                    <tr>
                      <td
                        colSpan={2}
                        className="p-3 text-center text-slate-500"
                      >
                        記録なし
                      </td>
                    </tr>
                  ) : (
                    dayRecords.map((r) => (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="max-w-[10rem] truncate p-2">
                          {saleLine(r)}
                        </td>
                        <td className="p-2 whitespace-nowrap text-slate-600">
                          {formatWhen(r.sold_at)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={() =>
                downloadDaySalesCsv(dayRecords, `day-sales-${activeSlug}.csv`)
              }
              disabled={dayRecords.length === 0}
              className="mt-3 w-full rounded-lg border border-blue-200 bg-blue-50 py-2 text-sm font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-40"
            >
              当日券 CSV
            </button>
          </section>

          <section className="border-t border-slate-100 pt-5">
            <h3 className="text-sm font-bold text-slate-800">前売り</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              CSV取込などで席状態が「前売り済」になっている分（全端末で共有）
            </p>
            <p className="mt-2 text-xl font-bold text-slate-800">
              合計{' '}
              <span className="text-blue-700">{presoldSeats.length}</span> 席
            </p>
            <div className="mt-2">
              <CategoryTotals items={presoldByCategory} />
            </div>
            <div className="mt-3 max-h-36 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-100 text-slate-600">
                  <tr>
                    <th className="p-2">席</th>
                    <th className="p-2">更新</th>
                  </tr>
                </thead>
                <tbody>
                  {presoldSeats.length === 0 ? (
                    <tr>
                      <td
                        colSpan={2}
                        className="p-3 text-center text-slate-500"
                      >
                        前売り済の席なし
                      </td>
                    </tr>
                  ) : (
                    presoldSeats.map((s) => (
                      <tr key={`${s.id}-${s.effectiveAllocation}`} className="border-t border-slate-100">
                        <td className="max-w-[10rem] truncate p-2">
                          {presoldLine(s)}
                        </td>
                        <td className="p-2 whitespace-nowrap text-slate-600">
                          {formatWhen(s.state.updated_at)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={() =>
                downloadPresoldCsv(
                  seats,
                  activeSlug,
                  `presold-${activeSlug}.csv`,
                )
              }
              disabled={presoldSeats.length === 0}
              className="mt-3 w-full rounded-lg border border-slate-300 bg-white py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40"
            >
              前売り CSV
            </button>
          </section>
        </div>

        <div className="border-t border-slate-100 p-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-slate-300 py-2.5 text-sm text-slate-700"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}
