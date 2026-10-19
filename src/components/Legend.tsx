import { legendSwatchClass, STATUS_LABELS } from '../lib/seatStatus'

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
      <span className="font-semibold text-slate-700">凡例</span>
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-4 w-4 rounded border-2 border-dashed border-slate-600 bg-slate-100/80"
          aria-hidden
        />
        <span className="text-slate-600">2階・チーム席（販売しません）</span>
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
              ? '販売済（前売り・当日・薄グレー）'
              : STATUS_LABELS[status]}
          </span>
        </div>
      ))}
    </div>
  )
}
