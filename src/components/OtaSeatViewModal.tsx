type Props = {
  block: string | null
  onClose: () => void
}

export function OtaSeatViewModal({ block, onClose }: Props) {
  if (!block) return null

  const src = `/ota-seat-view.html?block=${encodeURIComponent(block)}&embed=1`

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/95">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-700 px-3 py-2">
        <p className="text-sm font-medium text-white">
          席からの見え方（{block}）
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20"
        >
          閉じる
        </button>
      </div>
      <iframe
        title="席からの見え方 3D"
        src={src}
        className="min-h-0 flex-1 w-full border-0 bg-slate-900"
        allow="fullscreen"
      />
    </div>
  )
}
