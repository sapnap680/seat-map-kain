import { useEffect, useMemo, useState } from 'react'
import { eventTabLabel } from '../lib/allocation'
import { downloadCsvBlob, listDaySales } from '../lib/daySaleLog'
import { presoldSeatsForEvent } from '../lib/presoldExport'
import {
  combinedSalesSummaryToCsv,
  formatTicketPrice,
  summarizeDaySales,
  summarizePresoldSeats,
  type SalesSummary,
} from '../lib/salesSummary'
import type { SeatWithState, VenueEvent } from '../types'
import { ModalCloseButton } from './ModalCloseButton'

type Props = {
  open: boolean
  onClose: () => void
  events: VenueEvent[]
  activeSlug: string
  seats: SeatWithState[]
}

function SalesBlock({
  title,
  summary,
}: {
  title: string
  summary: SalesSummary
}) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-bold text-slate-800">{title}</h3>

      {summary.rows.length === 0 ? (
        <p className="text-sm text-slate-500">—</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-slate-200 text-sm">
            <table className="w-full text-left">
              <thead className="bg-slate-100 text-xs text-slate-600">
                <tr>
                  <th className="p-2 font-medium">席種</th>
                  <th className="p-2 text-right font-medium">枚数</th>
                  <th className="p-2 text-right font-medium">単価</th>
                  <th className="p-2 text-right font-medium">小計</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((r) => (
                  <tr key={r.category} className="border-t border-slate-100">
                    <td className="p-2 text-slate-800">{r.category}</td>
                    <td className="p-2 text-right tabular-nums">{r.count}</td>
                    <td className="p-2 text-right tabular-nums text-slate-600">
                      {r.unitYen != null ? formatTicketPrice(r.unitYen) : '—'}
                    </td>
                    <td className="p-2 text-right tabular-nums font-medium">
                      {formatTicketPrice(r.subtotalYen)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <tr>
                  <td className="p-2">合計</td>
                  <td className="p-2 text-right tabular-nums">
                    {summary.totalSeats}
                  </td>
                  <td className="p-2" />
                  <td className="p-2 text-right tabular-nums text-blue-800">
                    {formatTicketPrice(summary.totalYen)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </section>
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

  const daySummary = useMemo(
    () => summarizeDaySales(activeSlug, dayRecords),
    [activeSlug, dayRecords],
  )

  const presoldSummary = useMemo(
    () => summarizePresoldSeats(activeSlug, presoldSeats),
    [activeSlug, presoldSeats],
  )

  if (!open) return null

  const activeEvent = events.find((e) => e.slug === activeSlug)
  const eventTitle = activeEvent ? eventTabLabel(activeEvent) : activeSlug

  const canExport =
    dayRecords.length > 0 || presoldSeats.length > 0

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
          <SalesBlock title="当日券" summary={daySummary} />

          <div className="border-t border-slate-100 pt-5">
            <SalesBlock title="前売り" summary={presoldSummary} />
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 p-4">
          <button
            type="button"
            onClick={() =>
              downloadCsvBlob(
                combinedSalesSummaryToCsv(daySummary, presoldSummary),
                `sales-${activeSlug}.csv`,
              )
            }
            disabled={!canExport}
            className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            CSVダウンロード
          </button>
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
