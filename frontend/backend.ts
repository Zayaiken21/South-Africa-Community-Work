// Connection to the Supabase backend (accounts, shifts, payments, tracking).
// Settings come from /backend-config.json so they can be changed on GitHub without rebuilding.
// The anon key is meant to be public: every table is protected by row level security on the server.
import {createClient, type Session, type SupabaseClient} from '@supabase/supabase-js';
import {useEffect, useState} from 'react';

type Config = {supabaseUrl: string; supabaseAnonKey: string};
let clientPromise: Promise<SupabaseClient | null> | null = null;

export function backend(): Promise<SupabaseClient | null> {
  if (!clientPromise) {
    clientPromise = fetch('./backend-config.json', {cache: 'no-cache'})
      .then(r => (r.ok ? (r.json() as Promise<Config>) : null))
      .then((c: Config | null) => {
        if (!c?.supabaseUrl || !c?.supabaseAnonKey || !/^https:\/\//.test(c.supabaseUrl)) return null;
        return createClient(c.supabaseUrl, c.supabaseAnonKey, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce'}});
      })
      .catch(() => null);
  }
  return clientPromise;
}

export type Profile = {
  id: string; account_type: 'worker' | 'business'; full_name: string | null; headline: string | null; bio: string | null;
  skills: string[]; phone: string | null; city: string | null; province: string | null; lat: number | null; lon: number | null;
  resume_path: string | null; business_name: string | null; business_reg: string | null; payout_ready: boolean; verified: boolean; suspended: boolean;
  // Dual accounts and detailed profiles (database upgrade 2). Optional so the site still works before the upgrade is run.
  can_work?: boolean; can_hire?: boolean; active_mode?: 'worker' | 'business';
  avatar_url?: string | null; theme?: string; languages?: string[]; availability?: string[]; has_transport?: boolean | null;
  drivers_licence?: string | null; education?: string | null; experience?: Experience[]; business_type?: string | null;
  business_hours?: string | null; website?: string | null; created_at?: string;
  strikes?: number; suspended_reason?: string | null;
  business_bio?: string | null; business_avatar_url?: string | null; banned?: boolean;
};
export type Experience = {role: string; place: string; years?: string; note?: string};

// Which modes an account has switched on, with fallbacks for accounts made before upgrade 2.
export function modes(p: Profile) {
  const work = p.can_work ?? p.account_type === 'worker';
  const hire = p.can_hire ?? p.account_type === 'business';
  const active: 'worker' | 'business' = p.active_mode ?? p.account_type;
  return {work, hire, active, dual: work && hire};
}

// Session + profile + staff role, kept in sync with sign-in changes.
export function useAccount() {
  const [state, setState] = useState<{ready: boolean; sb: SupabaseClient | null; session: Session | null; profile: Profile | null; staff: 'ceo' | 'admin' | null; recovery: boolean}>(
    {ready: false, sb: null, session: null, profile: null, staff: null, recovery: false});
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    let unsub = () => {};
    backend().then(async sb => {
      if (!sb) { if (alive) setState(s => ({...s, ready: true})); return; }
      const load = async (session: Session | null, recovery = false) => {
        let profile: Profile | null = null, staff: 'ceo' | 'admin' | null = null;
        if (session) {
          const [{data: p}, {data: st}] = await Promise.all([
            sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
            sb.from('staff').select('role').eq('user_id', session.user.id).maybeSingle(),
          ]);
          profile = p as Profile | null; staff = (st?.role as any) ?? null;
        }
        if (alive) setState({ready: true, sb, session, profile, staff, recovery});
      };
      const {data} = await sb.auth.getSession();
      await load(data.session);
      const sub = sb.auth.onAuthStateChange((event, session) => { load(session, event === 'PASSWORD_RECOVERY'); });
      unsub = () => sub.data.subscription.unsubscribe();
    });
    return () => { alive = false; unsub(); };
  }, [tick]);
  return {...state, reload: () => setTick(t => t + 1)};
}

// Calls a server function with the signed-in user's token.
export async function callFunction<T = any>(sb: SupabaseClient, name: string, body: Record<string, unknown>): Promise<T> {
  const {data, error} = await sb.functions.invoke(name, {body});
  if (error) {
    let message = error.message;
    try { const ctx: any = (error as any).context; if (ctx?.json) message = (await ctx.json()).error ?? message; } catch { /* keep default */ }
    throw new Error(message);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String((e as any)?.message ?? e ?? 'Something went wrong'));
