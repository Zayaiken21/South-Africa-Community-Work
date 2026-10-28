import {createClient, type SupabaseClient} from 'npm:@supabase/supabase-js@2.45.4';

export const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://zayaiken21.github.io').split(',').map(s => s.trim());

export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Vary': 'Origin',
  };
}

export function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {status, headers: {...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});
}

// Server client: bypasses row level security, so it is only ever used after the caller has been checked.
export function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth: {persistSession: false}});
}

export type Caller = {id: string; email: string; aal: string; staff: 'ceo' | 'admin' | null; staffOk: boolean};

// Verifies the signed-in user's token with Supabase Auth, then reads their staff role.
export async function caller(req: Request): Promise<Caller> {
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) throw new HttpError(401, 'Please sign in.');
  const db = admin();
  const {data, error} = await db.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, 'Your session has expired. Please sign in again.');
  let aal = 'aal1';
  try { aal = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).aal ?? 'aal1'; } catch { /* token already verified above */ }
  const {data: s} = await db.from('staff').select('role').eq('user_id', data.user.id).maybeSingle();
  const staff = (s?.role as Caller['staff']) ?? null;
  // Two-step sign-in is optional, unless the CEO requires it for the team or this person switched it on:
  // then staff powers need a session verified with the authenticator code (aal2).
  let staffOk = false;
  if (staff) {
    if (aal === 'aal2') staffOk = true;
    else { const {data: needs} = await db.rpc('staff_needs_mfa', {p_user: data.user.id}); staffOk = needs === false; }
  }
  return {id: data.user.id, email: data.user.email ?? '', aal, staff, staffOk};
}

export const isStaffWithMfa = (c: Caller) => c.staffOk;

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function audit(actor: string | null, action: string, target: string, details: Record<string, unknown> = {}) {
  await admin().from('audit_log').insert({actor, action, target, details});
}
