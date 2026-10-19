import { INCARE_LABELS } from '../lib/incarePalette'
import { legendSwatchClass, STATUS_LABELS } from '../lib/seatStatus'

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
      <span className="font-semibold text-slate-700">凡例（料金表と同色）</span>
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-4 w-4 rounded border border-slate-300 bg-incare-floor1"
          aria-hidden
        />
        <span className="text-slate-600">{INCARE_LABELS.floor1}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-4 w-4 rounded border-2 border-dashed border-incare-floor2 bg-incare-floor2/40"
          aria-hidden
        />
        <span className="text-slate-600">{INCARE_LABELS.floor2}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-4 w-4 rounded border-2 border-dashed border-incare-team bg-incare-team/30"
          aria-hidden
        />
        <span className="text-slate-600">{INCARE_LABELS.teamTicket}</span>
      </div>
      {(
        [
          'available',
          'presold',
          'hold',
          'blocked',
        ] as const
      ).map((status) => (
        <div key={status} className="flex items-center gap-1.5">
          <span
            className={`inline-block h-4 w-4 rounded border ${legendSwatchClass(status)}`}
            aria-hidden
          />
          <span className="text-slate-600">
            {status === 'presold'
              ? '販売済（前売り・当日）'
              : STATUS_LABELS[status]}
          </span>
        </div>
      ))}
    </div>
  )
}
