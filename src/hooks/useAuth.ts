import { useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword } from 'firebase/auth'
import { auth, isFirebaseConfigured } from '../lib/firebase'
import { DEMO_STAFF_KEY } from '../lib/staffSession'

const staffEmail = (import.meta.env.VITE_STAFF_EMAIL as string | undefined)?.trim()
const staffPassword = (
  import.meta.env.VITE_STAFF_PASSWORD as string | undefined
)?.trim()

/** 会場席状況は常にスタッフ編集モード（ログインUIなし） */
export function useAuth() {
  const [loading, setLoading] = useState(isFirebaseConfigured)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      sessionStorage.setItem(DEMO_STAFF_KEY, '1')
      setLoading(false)
      return
    }

    let cancelled = false

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (cancelled) return
      setEmail(user?.email ?? null)
      if (user) setLoading(false)
    })

    async function ensureSession() {
      if (auth!.currentUser) {
        if (!cancelled) setLoading(false)
        return
      }
      if (staffEmail && staffPassword) {
        try {
          await signInWithEmailAndPassword(auth!, staffEmail, staffPassword)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.error('自動スタッフログインに失敗:', message)
        }
      }
      if (!cancelled) setLoading(false)
    }

    void ensureSession()

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return {
    isStaff: true,
    loading,
    email,
    signIn: async () => ({ error: null }),
    signOut: async () => {},
    isDemo: !isFirebaseConfigured,
  }
}
