// Shift pay through TradeSafe escrow.
//   payout_setup  worker  — registers the worker with TradeSafe, including the bank account pay is released to
//   fund          business — creates the escrow for an accepted booking and returns TradeSafe's payment page
//   release       business (hours confirmed by both sides) or CEO/admin with authenticator code — pays the worker
//   dispute       business, worker or staff — freezes the money for the team to resolve
//   cancel        business before funding, or staff — cancels and refunds
//   cash_paid     business — records that a cash shift was paid in person (no escrow)
//   refresh       any party or staff — re-reads the state from TradeSafe
// Money is never held by Community Work: TradeSafe holds it, and only this server (with the TradeSafe secret) can ask
// TradeSafe to release it, after the checks below.

import {admin, audit, caller, cors, HttpError, isStaffWithMfa, json, type Caller} from '../_shared/auth.ts';
import * as ts from '../_shared/tradesafe.ts';

const BANKS = ['ABSA', 'AFRICAN_BANK', 'CAPITEC', 'DISCOVERY', 'FNB', 'INVESTEC', 'NEDBANK', 'SASFIN', 'STANDARD_BANK', 'TYME', 'OLD_MUTUAL', 'BIDVEST']; // VERIFY against TradeSafe's bank enum

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors(req)});
  if (req.method !== 'POST') return json(req, {error: 'Method not allowed'}, 405);
  try {
    const who = await caller(req);
    const body = await req.json().catch(() => ({}));
    switch (body.action) {
      case 'payout_setup': return json(req, await payoutSetup(who, body));
      case 'fund': return json(req, await fund(who, body));
      case 'release': return json(req, await release(who, body));
      case 'dispute': return json(req, await dispute(who, body));
      case 'cancel': return json(req, await cancel(who, body));
      case 'cash_paid': return json(req, await cashPaid(who, body));
      case 'refresh': return json(req, await refresh(who, body));
      default: throw new HttpError(400, 'Unknown action');
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    return json(req, {error: e instanceof HttpError ? e.message : 'Something went wrong with the payment service. Nothing was charged; please try again.'}, status);
  }
});

const db = admin();
const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const SA_ID = /^\d{13}$/;
const SA_MOBILE = /^(\+27|0)[6-8]\d{8}$/;

function person(who: Caller, b: any): ts.Person {
  const p = {givenName: text(b.givenName, 60), familyName: text(b.familyName, 60), email: who.email,
             mobile: text(b.mobile, 15).replace(/\s/g, ''), idNumber: text(b.idNumber, 13)};
  if (!p.givenName || !p.familyName) throw new HttpError(400, 'Enter your first name and surname as on your ID.');
  if (!SA_ID.test(p.idNumber)) throw new HttpError(400, 'Enter your 13-digit South African ID number.');
  if (!SA_MOBILE.test(p.mobile)) throw new HttpError(400, 'Enter a South African mobile number, e.g. 082 123 4567.');
  return p;
}

async function profile(id: string) {
  const {data} = await db.from('profiles').select('*').eq('id', id).single();
  if (!data) throw new HttpError(404, 'Account not found.');
  if (data.suspended) throw new HttpError(403, 'This account is suspended. Contact support.');
  return data;
}

async function payoutSetup(who: Caller, b: any) {
  const me = await profile(who.id);
  if (!me.can_work) throw new HttpError(403, 'Switch on working in your account settings to add payout details.');
  const bank = {bank: text(b.bank, 30).toUpperCase(), accountNumber: text(b.accountNumber, 20).replace(/\D/g, ''),
                accountType: b.accountType === 'SAVINGS' ? 'SAVINGS' as const : 'CHEQUE' as const};
  if (!BANKS.includes(bank.bank)) throw new HttpError(400, 'Choose your bank.');
  if (bank.accountNumber.length < 6 || bank.accountNumber.length > 16) throw new HttpError(400, 'Check your account number.');
  const token = await ts.createToken(person(who, b), bank);
  await db.from('profiles').update({tradesafe_token_id: token, payout_ready: true}).eq('id', who.id);
  await audit(who.id, 'payout.setup', who.id, {bank: bank.bank, last4: bank.accountNumber.slice(-4)});
  return {ok: true, last4: bank.accountNumber.slice(-4)};
}

async function booking(applicationId: string) {
  const {data: a} = await db.from('applications').select('*, shift:shifts(*)').eq('id', text(applicationId, 40)).single();
  if (!a) throw new HttpError(404, 'Booking not found.');
  return a as any;
}

async function fund(who: Caller, b: any) {
  const a = await booking(b.applicationId);
  const shift = a.shift;
  if (shift.business_id !== who.id) throw new HttpError(403, 'Only the business that posted this shift can pay for it.');
  if (shift.payment_method !== 'escrow') throw new HttpError(400, 'This shift is set to be paid in cash.');
  if (a.status !== 'accepted') throw new HttpError(400, 'Accept the worker before paying.');
  const {data: existing} = await db.from('payments').select('*').eq('application_id', a.id).maybeSingle();
  if (existing?.checkout_url && existing.state === 'awaiting_payment') return {checkoutUrl: existing.checkout_url, paymentId: existing.id};
  if (existing) throw new HttpError(400, 'This booking already has a payment.');

  const business = await profile(who.id);
  const worker = await profile(a.worker_id);
  if (!worker.payout_ready || !worker.tradesafe_token_id) throw new HttpError(400, 'The worker still needs to add payout details. We have asked them to do it.');
  let buyerToken = business.tradesafe_token_id;
  if (!buyerToken) {
    buyerToken = await ts.createToken(person(who, b), undefined, business.business_name ? {name: business.business_name, registration: business.business_reg ?? undefined} : undefined);
    await db.from('profiles').update({tradesafe_token_id: buyerToken}).eq('id', who.id);
  }
  const {data: settings} = await db.rpc('public_settings');
  const hours = Math.round(((Date.parse(shift.ends_at) - Date.parse(shift.starts_at)) / 36e5) * 100) / 100;
  const amount = Math.round(hours * Number(shift.hourly_rate_zar) * 100) / 100;
  const feePercent = Number(settings?.platform_fee_percent ?? 10);
  const {transactionId, allocationId} = await ts.createShiftTransaction({
    reference: a.id, title: `${shift.title} — ${new Date(shift.starts_at).toLocaleDateString('en-ZA', {timeZone: 'Africa/Johannesburg'})}`,
    description: `${hours} hours at R${shift.hourly_rate_zar}/hour, ${shift.city}. Worker: ${worker.full_name ?? ''}.`,
    buyerToken, sellerToken: worker.tradesafe_token_id, amountZar: amount, feePercent,
  });
  const url = await ts.checkoutLink(transactionId);
  const {data: pay, error} = await db.from('payments').insert({
    application_id: a.id, shift_id: shift.id, business_id: who.id, worker_id: a.worker_id, hours, hourly_rate_zar: shift.hourly_rate_zar,
    amount_zar: amount, fee_zar: Math.round(amount * feePercent) / 100, provider: 'tradesafe',
    provider_transaction_id: transactionId, provider_allocation_id: allocationId, checkout_url: url, state: 'awaiting_payment',
  }).select().single();
  if (error) throw error;
  return {checkoutUrl: url, paymentId: pay.id};
}

async function payment(id: string) {
  const {data} = await db.from('payments').select('*').eq('id', text(id, 40)).single();
  if (!data) throw new HttpError(404, 'Payment not found.');
  return data as any;
}

async function release(who: Caller, b: any) {
  const p = await payment(b.paymentId);
  const staff = isStaffWithMfa(who);
  if (p.state !== 'funded') throw new HttpError(400, p.state === 'awaiting_payment' ? 'The business hasn\'t paid into escrow yet.' : `This payment is ${p.state.replace('_', ' ')}.`);
  if (!staff) {
    if (p.business_id !== who.id) throw new HttpError(403, 'Only the business or Community Work staff can release pay.');
    const {data: a} = await db.from('applications').select('*').eq('id', p.application_id).single();
    if (!a?.business_confirmed_at || a.hours_worked == null) throw new HttpError(400, 'Record and confirm the hours worked first.');
    if (Number(a.hours_worked) < Number(p.hours)) throw new HttpError(400, 'Fewer hours were worked than booked. Our team will release the right amount and refund the rest — we have flagged it for them.');
  }
  // Re-check with TradeSafe that the money is really there before releasing.
  const live = await ts.transactionState(p.provider_transaction_id);
  if (ts.mapState(live.state) !== 'funded') throw new HttpError(409, 'TradeSafe doesn\'t show this payment as funded yet.');
  await ts.releaseAllocation(p.provider_allocation_id);
  await db.from('payments').update({state: 'released', provider_state: 'RELEASE_REQUESTED', released_by: who.id, released_at: new Date().toISOString(), updated_at: new Date().toISOString()}).eq('id', p.id);
  await db.from('applications').update({status: 'completed'}).eq('id', p.application_id);
  await audit(who.id, staff ? 'payment.release_by_staff' : 'payment.release_by_business', p.id, {amount_zar: p.amount_zar});
  return {ok: true};
}

async function dispute(who: Caller, b: any) {
  const p = await payment(b.paymentId);
  if (!isStaffWithMfa(who) && who.id !== p.business_id && who.id !== p.worker_id) throw new HttpError(403, 'Not your payment.');
  if (p.state !== 'funded') throw new HttpError(400, 'Only money held in escrow can be disputed.');
  await ts.disputeAllocation(p.provider_allocation_id);
  await db.from('payments').update({state: 'disputed', updated_at: new Date().toISOString()}).eq('id', p.id);
  await audit(who.id, 'payment.dispute', p.id, {reason: text(b.reason, 500)});
  return {ok: true};
}

async function cancel(who: Caller, b: any) {
  const p = await payment(b.paymentId);
  const staff = isStaffWithMfa(who);
  // The worker cancelled, didn't show up, or the business released them: the business gets its money back.
  const {data: app} = await db.from('applications').select('status').eq('id', p.application_id).maybeSingle();
  const bookingEnded = ['withdrawn', 'declined', 'no_show'].includes(app?.status ?? '');
  const party = who.id === p.business_id || who.id === p.worker_id;
  if (!staff && !(who.id === p.business_id && p.state === 'awaiting_payment') && !(party && bookingEnded && p.state !== 'disputed'))
    throw new HttpError(403, 'Once paid, only Community Work staff can cancel and refund.');
  if (!['awaiting_payment', 'funded', 'disputed'].includes(p.state)) throw new HttpError(400, `This payment is already ${p.state}.`);
  await ts.cancelTransaction(p.provider_transaction_id, text(b.reason, 300) || 'Cancelled on Community Work');
  await db.from('payments').update({state: p.state === 'awaiting_payment' ? 'cancelled' : 'refunded', updated_at: new Date().toISOString()}).eq('id', p.id);
  await audit(who.id, 'payment.cancel', p.id, {by_staff: staff});
  return {ok: true};
}

async function cashPaid(who: Caller, b: any) {
  const a = await booking(b.applicationId);
  if (a.shift.business_id !== who.id) throw new HttpError(403, 'Only the business can record cash payment.');
  if (a.shift.payment_method !== 'cash') throw new HttpError(400, 'This shift is paid through escrow.');
  if (a.hours_worked == null) throw new HttpError(400, 'Record the hours worked first.');
  const amount = Math.round(Number(a.hours_worked) * Number(a.shift.hourly_rate_zar) * 100) / 100;
  await db.from('payments').upsert({
    application_id: a.id, shift_id: a.shift.id, business_id: who.id, worker_id: a.worker_id, hours: a.hours_worked,
    hourly_rate_zar: a.shift.hourly_rate_zar, amount_zar: amount, fee_zar: 0, provider: 'cash', state: 'cash_paid',
    released_by: who.id, released_at: new Date().toISOString(),
  }, {onConflict: 'application_id'});
  await db.from('applications').update({status: 'completed'}).eq('id', a.id);
  return {ok: true, amount};
}

async function refresh(who: Caller, b: any) {
  const p = await payment(b.paymentId);
  if (!isStaffWithMfa(who) && who.id !== p.business_id && who.id !== p.worker_id) throw new HttpError(403, 'Not your payment.');
  if (!p.provider_transaction_id) return {state: p.state};
  const live = await ts.transactionState(p.provider_transaction_id);
  const next = ts.mapState(live.state);
  if (next && next !== p.state && !(p.state === 'released' && next !== 'released')) {
    await db.from('payments').update({state: next, provider_state: live.state, updated_at: new Date().toISOString()}).eq('id', p.id);
  }
  return {state: next ?? p.state, providerState: live.state};
}
