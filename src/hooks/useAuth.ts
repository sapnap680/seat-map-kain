import { useCallback, useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const DEMO_STAFF_KEY = 'seat-map-demo-staff'
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

    supabase.auth.getSession().then(({ data }) => {
      setIsStaff(!!data.session)
      setEmail(data.session?.user.email ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsStaff(!!session)
      setEmail(session?.user.email ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (staffEmail: string, password: string) => {
    if (!isSupabaseConfigured || !supabase) {
      if (password === DEMO_PASSWORD) {
        sessionStorage.setItem(DEMO_STAFF_KEY, '1')
        setIsStaff(true)
        return { error: null }
      }
      return { error: new Error('デモモード: パスワードは staff-demo です') }
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: staffEmail,
      password,
    })
    return { error }
  }, [])

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      sessionStorage.removeItem(DEMO_STAFF_KEY)
      setIsStaff(false)
      return
    }
    await supabase.auth.signOut()
  }, [])

  return { isStaff, loading, email, signIn, signOut, isDemo: !isSupabaseConfigured }
}
