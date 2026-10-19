import { GENDER_VIEW_LABELS } from '../lib/allocation'
import type { GenderView } from '../types'

type Props = {
  value: GenderView
  onChange: (v: GenderView) => void
}

export function GenderViewToggle({ value, onChange }: Props) {
  return (
    <div
      className="inline-flex rounded-lg border border-violet-200 bg-violet-50 p-0.5 text-sm"
      role="group"
      aria-label="男子女子の表示切替"
    >
      {(['men', 'women'] as const).map((g) => (
        <button
          key={g}
          type="button"
          onClick={() => onChange(g)}
          className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
            value === g
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-violet-800 hover:bg-violet-100'
          }`}
        >
          {GENDER_VIEW_LABELS[g]}側を表示
        </button>
      ))}
    </div>
  )
}
