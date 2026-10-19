import { useEffect, useMemo, useState } from 'react'
import { eventTabLabel, ZONE_LABELS } from '../lib/allocation'
import {
  daySalesByZone,
  downloadDaySalesCsv,
  listDaySales,
  type DaySaleRecord,
} from '../lib/daySaleLog'
import type { SeatZone, VenueEvent } from '../types'
import { ModalCloseButton } from './ModalCloseButton'

function saleLine(r: DaySaleRecord): string {
  if (r.category) return `${r.category} ${r.label}`
  return r.label
}

type Props = {
  open: boolean
  onClose: () => void
  events: VenueEvent[]
  activeSlug: string
}

function formatSoldAt(iso: string): string {
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

export function StaffDaySalesModal({
  open,
  onClose,
  events,
  activeSlug,
}: Props) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const onChange = () => setTick((t) => t + 1)
    window.addEventListener('seat-map-day-sales-changed', onChange)
    return () => window.removeEventListener('seat-map-day-sales-changed', onChange)
  }, [])

  const records = useMemo(() => {
    void tick
    return listDaySales(activeSlug)
  }, [activeSlug, tick])

  const byZone = useMemo(() => {
    void tick
    return daySalesByZone(activeSlug)
  }, [activeSlug, tick])

  if (!open) return null

  const activeEvent = events.find((e) => e.slug === activeSlug)
  const eventTitle = activeEvent ? eventTabLabel(activeEvent) : activeSlug

  const exportCsv = () => {
    downloadDaySalesCsv(records, `day-sales-${activeSlug}.csv`)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 p-5">
          <div>
            <h2 className="text-lg font-bold text-slate-800">当日券の集計</h2>
            <p className="mt-1 text-sm text-slate-600">
              {eventTitle} — この端末で記録した販売のみ（取り消ししてもログは残ります）
            </p>
          </div>
          <ModalCloseButton onClose={onClose} />
        </div>

        <div className="space-y-3 overflow-auto p-5">
          <p className="text-2xl font-bold text-slate-800">
            合計 <span className="text-blue-700">{records.length}</span> 席
          </p>

          {Object.keys(byZone).length > 0 && (
            <ul className="grid grid-cols-2 gap-2 text-sm text-slate-700">
              {(Object.entries(byZone) as [SeatZone, number][]).map(
                ([zone, n]) => (
                  <li
                    key={zone}
                    className="rounded-lg bg-slate-50 px-3 py-2"
                  >
                    {ZONE_LABELS[zone] ?? zone}: {n}
                  </li>
                ),
              )}
            </ul>
          )}

          <div className="max-h-48 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-100 text-slate-600">
                <tr>
                  <th className="p-2">席</th>
                  <th className="p-2">日時</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="p-4 text-center text-slate-500">
                      まだ記録がありません
                    </td>
                  </tr>
                ) : (
                  records.map((r: DaySaleRecord) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="max-w-[10rem] truncate p-2">
                        {saleLine(r)}
                      </td>
                      <td className="p-2 whitespace-nowrap text-slate-600">
                        {formatSoldAt(r.sold_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex gap-2 border-t border-slate-100 p-4">
          <button
            type="button"
            onClick={exportCsv}
            disabled={records.length === 0}
            className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            CSVダウンロード
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-700"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}
