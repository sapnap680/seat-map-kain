import { getDocument } from 'pdfjs-dist'
import { useEffect, useRef, useState } from 'react'
import '../lib/pdfjsSetup'

type Props = {
  pdfUrl: string
  onPageSize?: (w: number, h: number) => void
  onError?: () => void
}

/** ブラウザ PDF エンジンで原稿を描画（PNG 変換より色が PDF に近い） */
export function PdfPageCanvas({ pdfUrl, onPageSize, onError }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(
    null,
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false
    const task = getDocument({ url: pdfUrl })

    task.promise
      .then(async (pdf) => {
        if (cancelled) return
        const page = await pdf.getPage(1)
        const baseViewport = page.getViewport({ scale: 1 })
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const renderViewport = page.getViewport({ scale: dpr })

        canvas.width = renderViewport.width
        canvas.height = renderViewport.height
        canvas.style.width = `${baseViewport.width}px`
        canvas.style.height = `${baseViewport.height}px`

        setDisplaySize({ w: baseViewport.width, h: baseViewport.height })
        onPageSize?.(baseViewport.width, baseViewport.height)

        const ctx = canvas.getContext('2d', { alpha: false })
        if (!ctx) throw new Error('canvas 2d unavailable')

        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        await page.render({
          canvasContext: ctx,
          viewport: renderViewport,
          canvas,
        }).promise
      })
      .catch(() => {
        if (!cancelled) onError?.()
      })

    return () => {
      cancelled = true
      void task.destroy()
    }
  }, [pdfUrl, onPageSize, onError])

  return (
    <canvas
      ref={canvasRef}
      className="block h-auto max-w-full"
      style={
        displaySize
          ? { width: '100%', height: 'auto', aspectRatio: `${displaySize.w} / ${displaySize.h}` }
          : { width: '100%', minHeight: 200 }
      }
      aria-label="会場席図 PDF"
    />
  )
}
