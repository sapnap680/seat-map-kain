import { useEffect, useMemo, useState } from 'react'
import { eventTabLabel } from '../lib/allocation'
import { downloadDaySalesCsv, listDaySales } from '../lib/daySaleLog'
import { downloadPresoldCsv, presoldSeatsForEvent } from '../lib/presoldExport'
import {
  formatTicketPrice,
  salesSummaryToCsv,
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
  hint,
  summary,
  csvLabel,
  onCsv,
  csvDisabled,
  tone,
}: {
  title: string
  hint: string
  summary: SalesSummary
  csvLabel: string
  onCsv: () => void
  csvDisabled: boolean
  tone: 'day' | 'presold'
}) {
  const btnClass =
    tone === 'day'
      ? 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100'
      : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'

  return (
    <section>
      <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      <p className="mt-0.5 text-xs text-slate-500">{hint}</p>

      {summary.rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">データなし</p>
      ) : (
        <>
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 text-sm">
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
                      {r.hasUnknownPrice && (
                        <span className="ml-1 text-xs font-normal text-amber-700">
                          ※
                        </span>
                      )}
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
          {summary.hasUnknownPrice && (
            <p className="mt-1 text-xs text-amber-800">
              ※ 料金が未設定の席は小計に含めていません
            </p>
          )}
        </>
      )}

      <button
        type="button"
        onClick={onCsv}
        disabled={csvDisabled}
        className={`mt-3 w-full rounded-lg border py-2 text-sm font-medium disabled:opacity-40 ${btnClass}`}
      >
        {csvLabel}
      </button>
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
          <SalesBlock
            title="当日券"
            hint="この端末で記録した分（取り消ししてもログは残ります）"
            summary={daySummary}
            csvLabel="当日券 CSV"
            csvDisabled={dayRecords.length === 0}
            tone="day"
            onCsv={() =>
              downloadDaySalesCsv(
                salesSummaryToCsv('当日券', daySummary),
                `day-sales-${activeSlug}.csv`,
              )
            }
          />

          <div className="border-t border-slate-100 pt-5">
            <SalesBlock
              title="前売り"
              hint="席状態が「前売り済」の分（全端末で共有）"
              summary={presoldSummary}
              csvLabel="前売り CSV"
              csvDisabled={presoldSeats.length === 0}
              tone="presold"
              onCsv={() =>
                downloadPresoldCsv(
                  salesSummaryToCsv('前売り', presoldSummary),
                  `presold-${activeSlug}.csv`,
                )
              }
            />
          </div>
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
