import { useCallback, useEffect, useState } from 'react'
import { DEMO_STAFF_KEY } from '../lib/staffSession'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const DEMO_PASSWORD = 'staff-demo'

export function useAuth() {
  const [isStaff, setIsStaff] = useState(false)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setIsStaff(sessionStorage.getItem(DEMO_STAFF_KEY) === '1')
      setLoading(false)
      return
    }

    const demoStaff = sessionStorage.getItem(DEMO_STAFF_KEY) === '1'

    supabase.auth.getSession().then(({ data }) => {
      setIsStaff(!!data.session || demoStaff)
      setEmail(data.session?.user.email ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const demo = sessionStorage.getItem(DEMO_STAFF_KEY) === '1'
      setIsStaff(!!session || demo)
      setEmail(session?.user.email ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (staffEmail: string, password: string) => {
    if (password === DEMO_PASSWORD) {
      sessionStorage.setItem(DEMO_STAFF_KEY, '1')
      setIsStaff(true)
      setEmail(staffEmail.trim() || null)
      return { error: null }
    }

    if (!isSupabaseConfigured || !supabase) {
      return { error: new Error('パスワードが正しくありません') }
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: staffEmail,
      password,
    })
    return { error }
  }, [])

  const signOut = useCallback(async () => {
    sessionStorage.removeItem(DEMO_STAFF_KEY)
    if (!isSupabaseConfigured || !supabase) {
      setIsStaff(false)
      setEmail(null)
      return
    }
    await supabase.auth.signOut()
    setIsStaff(false)
    setEmail(null)
  }, [])

  return { isStaff, loading, email, signIn, signOut, isDemo: !isSupabaseConfigured }
}
