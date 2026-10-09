import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type SessionRow } from './supabase'

export type Load<T> = { kind: 'loading' } | { kind: 'error'; message: string; auth?: boolean } | { kind: 'ok'; data: T }

/** The signed-in user's saved sessions, newest first. RLS limits rows to the owner. */
export function useSessions(user: User | null | undefined) {
  const [state, setState] = useState<Load<SessionRow[]>>({ kind: 'loading' })
  const load = useCallback(async () => {
    if (!supabase || !user) return
    setState({ kind: 'loading' })
    if (!navigator.onLine) return setState({ kind: 'error', message: 'You are offline. Connect to the internet and retry.' })
    const { data, error, status } = await supabase.from('exercise_sessions').select('*').order('started_at', { ascending: false })
    if (error) return setState({ kind: 'error', message: error.message, auth: status === 401 || status === 403 })
    setState({ kind: 'ok', data: data as SessionRow[] })
  }, [user])
  useEffect(() => { void load() }, [load])
  return { state, reload: load }
}
