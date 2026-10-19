import { useCallback, useState } from 'react'

export function SharePublicLink() {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async () => {
    const url =
      (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.trim() ||
      window.location.origin + window.location.pathname
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      // #region agent log
      fetch(
        'http://127.0.0.1:7500/ingest/19379df4-9811-4df9-970f-970d9b07ac55',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Debug-Session-Id': '0c7e1f',
          },
          body: JSON.stringify({
            sessionId: '0c7e1f',
            hypothesisId: 'H-public-share',
            location: 'SharePublicLink.tsx:copy',
            message: 'public URL copied',
            data: { urlLength: url.length },
            timestamp: Date.now(),
          }),
        },
      ).catch(() => {})
      // #endregion
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('このURLをコピーしてください', url)
    }
  }, [])

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
    >
      {copied ? 'コピーしました' : '公開URLをコピー'}
    </button>
  )
}
