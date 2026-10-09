import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type ProfileRow } from './supabase'

export type { UserRole, ProfileRow } from './supabase'

/** Current Supabase user; `undefined` while the stored session is loading. */
export function useUser(): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(supabase ? undefined : null)
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null))
    return () => data.subscription.unsubscribe()
  }, [])
  return user
}

/** Fetches the authenticated user's profile and assigned role. */
export function useProfile(user: User | null | undefined) {
  const [profile, setProfile] = useState<ProfileRow | null | undefined>(
    user === undefined ? undefined : null,
  )

  useEffect(() => {
    if (!supabase || !user) {
      setProfile(user === undefined ? undefined : null)
      return
    }

    let isMounted = true

    async function fetchProfile() {
      try {
        const { data, error } = await supabase!
          .from('profiles')
          .select('*')
          .eq('id', user!.id)
          .maybeSingle()

        if (!isMounted) return

        if (error || !data) {
          // Fallback profile if row is not created yet or column is default
          const metaRole = (user!.user_metadata?.role as ProfileRow['role']) || 'patient'
          setProfile({
            id: user!.id,
            display_name: (user!.user_metadata?.display_name as string) || null,
            role: metaRole,
            is_verified_professional: false,
          })
        } else {
          setProfile({
            id: data.id,
            display_name: data.display_name ?? null,
            role: data.role ?? 'patient',
            is_verified_professional: !!data.is_verified_professional,
            created_at: data.created_at,
          })
        }
      } catch {
        if (isMounted) {
          setProfile({
            id: user!.id,
            display_name: (user!.user_metadata?.display_name as string) || null,
            role: (user!.user_metadata?.role as ProfileRow['role']) || 'patient',
            is_verified_professional: false,
          })
        }
      }
    }

    void fetchProfile()

    return () => {
      isMounted = false
    }
  }, [user])

  return profile
}

/** Convenient combined auth hook. */
export function useAuth() {
  const user = useUser()
  const profile = useProfile(user)
  const loading = user === undefined || (user !== null && profile === undefined)
  return { user, profile, loading }
}
