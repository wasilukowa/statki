import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Brak zmiennych środowiskowych VITE_SUPABASE_URL lub VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Zapewnia anonimową sesję Supabase Auth — przy pierwszym wywołaniu loguje anonimowo,
// przy kolejnych odczytuje istniejącą sesję. Zwraca UUID gracza (= auth.uid()).
export async function ensureAnonymousSession(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) {
    sessionStorage.setItem('player-id', session.user.id)
    return session.user.id
  }
  const { data, error } = await supabase.auth.signInAnonymously()
  if (error || !data.user) throw new Error('Nie udało się zalogować anonimowo')
  sessionStorage.setItem('player-id', data.user.id)
  return data.user.id
}
