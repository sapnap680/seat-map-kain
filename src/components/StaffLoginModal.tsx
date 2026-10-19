import { useState, type FormEvent } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  onSignIn: (email: string, password: string) => Promise<{ error: Error | null }>
  isDemo: boolean
}

export function StaffLoginModal({ open, onClose, onSignIn, isDemo }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!open) return null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error: err } = await onSignIn(email, password)
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-slate-800">スタッフログイン</h2>
        <p className="mt-1 text-sm text-slate-500">
          席の状態を変更するにはログインしてください。
        </p>
        <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
          共有スタッフ用パスワード:{' '}
          <code className="font-mono">staff-demo</code>
          {isDemo ? '（メールは空でOK）' : '（Supabase アカウントが無い場合）'}
        </p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          {!isDemo && (
            <label className="block text-sm">
              <span className="text-slate-600">メール（Supabase 利用時）</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                autoComplete="username"
              />
            </label>
          )}
          <label className="block text-sm">
            <span className="text-slate-600">パスワード</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              autoComplete="current-password"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-100"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? 'ログイン中…' : 'ログイン'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
