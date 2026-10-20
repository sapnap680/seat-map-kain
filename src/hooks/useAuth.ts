import { useEffect, useState } from 'react'
import { DEMO_STAFF_KEY } from '../lib/staffSession'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const staffEmail = (import.meta.env.VITE_STAFF_EMAIL as string | undefined)?.trim()
const staffPassword = (
  import.meta.env.VITE_STAFF_PASSWORD as string | undefined
)?.trim()

/** 会場席状況は常にスタッフ編集モード（ログインUIなし） */
export function useAuth() {
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      sessionStorage.setItem(DEMO_STAFF_KEY, '1')
      setLoading(false)
      return
    }

    let cancelled = false

    async function ensureSession() {
      const { data } = await supabase!.auth.getSession()
      if (cancelled) return
      if (data.session) {
        setEmail(data.session.user.email ?? null)
        setLoading(false)
        return
      }
      if (staffEmail && staffPassword) {
        const { error } = await supabase!.auth.signInWithPassword({
          email: staffEmail,
          password: staffPassword,
        })
        if (error) console.error('自動スタッフログインに失敗:', error.message)
      }
      if (!cancelled) setLoading(false)
    }

    void ensureSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  return {
    isStaff: true,
    loading,
    email,
    signIn: async () => ({ error: null }),
    signOut: async () => {},
    isDemo: !isSupabaseConfigured,
  }
}
