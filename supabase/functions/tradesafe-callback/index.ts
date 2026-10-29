// TradeSafe calls this when a transaction changes state. Set the callback URL in your TradeSafe application to
//   https://<project>.supabase.co/functions/v1/tradesafe-callback?secret=<TRADESAFE_CALLBACK_SECRET>
// Deploy with --no-verify-jwt (TradeSafe can't send a Supabase login). Three protections:
//   1. the secret in the URL must match;  2. the request must come from TradeSafe's published IP addresses;
//   3. the payload is never trusted — the state is re-read from TradeSafe's API with our own credentials.

import {admin} from '../_shared/auth.ts';
import {mapState, transactionState} from '../_shared/tradesafe.ts';

const TRADESAFE_IPS = (
  Deno.env.get('TRADESAFE_CALLBACK_IPS') ?? '13.244.170.245,13.244.43.204,13.244.48.16,13.244.147.116'
)
  .split(',')
  .map(s => s.trim());

function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async req => {
  const ok = () => new Response('ok', {status: 200});
  if (req.method !== 'POST') return new Response('Method not allowed', {status: 405});
  const secret = Deno.env.get('TRADESAFE_CALLBACK_SECRET') ?? '';
  const given = new URL(req.url).searchParams.get('secret') ?? new URL(req.url).pathname.split('/').pop() ?? '';
  if (!safeEqual(given, secret)) return new Response('Forbidden', {status: 403});
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  if (Deno.env.get('TRADESAFE_CHECK_IP') !== 'false' && !TRADESAFE_IPS.includes(ip)) {
    console.warn('Callback from unexpected IP', ip);
    return new Response('Forbidden', {status: 403});
  }
  const body = await req.json().catch(() => null);
  const id = String(body?.data?.id ?? '').slice(0, 64);
  if (!id) return ok();

  const db = admin();
  const {data: p} = await db.from('payments').select('id, state').eq('provider_transaction_id', id).maybeSingle();
  if (!p) return ok(); // not one of ours

  const live = await transactionState(id); // trust TradeSafe's API, not the callback body
  const next = mapState(live.state);
  if (!next || next === p.state) return ok();
  if (p.state === 'released' && next !== 'released') return ok(); // never move backwards from released
  const patch: Record<string, unknown> = {
    state: next,
    provider_state: live.state,
    updated_at: new Date().toISOString(),
  };
  if (next === 'released') patch.released_at = new Date().toISOString();
  await db.from('payments').update(patch).eq('id', p.id);
  return ok();
});
