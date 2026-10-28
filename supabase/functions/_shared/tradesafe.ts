// TradeSafe escrow API (https://docs.tradesafe.co.za). OAuth client credentials + GraphQL.
// All GraphQL lives in this file. Field names marked VERIFY come from TradeSafe's public docs but must be
// confirmed against your sandbox schema (Settings → Developer → GraphQL playground) before going live.

const AUTH_URL = Deno.env.get('TRADESAFE_AUTH_URL') ?? 'https://auth.tradesafe.co.za/oauth/token';
const API_URL = Deno.env.get('TRADESAFE_API_URL') ?? 'https://api-developer.tradesafe.dev/graphql'; // sandbox; production: https://api.tradesafe.co.za/graphql (VERIFY)

let cached: {token: string; expires: number} | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: required('TRADESAFE_CLIENT_ID'),
    client_secret: required('TRADESAFE_CLIENT_SECRET'),
  });
  const r = await fetch(AUTH_URL, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body});
  if (!r.ok) throw new Error(`TradeSafe sign-in failed (${r.status})`);
  const d = await r.json();
  cached = {token: d.access_token, expires: Date.now() + (Number(d.expires_in) || 3600) * 1000};
  return cached.token;
}

export function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Server setting ${name} is missing`);
  return v;
}

export async function gql<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${await accessToken()}`},
    body: JSON.stringify({query, variables}),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.errors?.length) throw new Error('TradeSafe: ' + (d.errors?.map((e: any) => e.message).join('; ') || r.status));
  return d.data as T;
}

// ---- Parties ----------------------------------------------------------------------------------------------

export type Person = {givenName: string; familyName: string; email: string; mobile: string; idNumber: string};
export type Bank = {bank: string; accountNumber: string; accountType: 'CHEQUE' | 'SAVINGS'};

// Creates a TradeSafe token (a party). Banking details are sent straight to TradeSafe and never stored by us.
// TradeSafe doesn't allow banking details to change on a token; a new token is created instead.
export async function createToken(person: Person, bank?: Bank, organization?: {name: string; registration?: string}) {
  const d = await gql<{tokenCreate: {id: string}}>(`
    mutation tokenCreate($input: TokenInput!) { tokenCreate(input: $input) { id } }`, {
    input: {
      user: {givenName: person.givenName, familyName: person.familyName, email: person.email, mobile: person.mobile,
             idNumber: person.idNumber, idType: 'NATIONAL', idCountry: 'ZAF'},                       // VERIFY enum values
      ...(organization ? {organization: {name: organization.name, tradeName: organization.name, type: 'PRIVATE', registrationNumber: organization.registration}} : {}),
      ...(bank ? {bankAccount: {accountNumber: bank.accountNumber, accountType: bank.accountType, bank: bank.bank}} : {}),
      settings: {payout: {interval: 'IMMEDIATE', refundInterval: 'IMMEDIATE'}},                       // VERIFY
    },
  });
  return d.tokenCreate.id;
}

// ---- Transactions -----------------------------------------------------------------------------------------

// One shift booking = one escrow transaction with one allocation (the worker's pay).
// The platform is the AGENT and earns its fee on top, paid by the business, so the worker gets the full wage.
export async function createShiftTransaction(o: {
  reference: string; title: string; description: string; buyerToken: string; sellerToken: string;
  amountZar: number; feePercent: number; daysToInspect?: number;
}) {
  const agentToken = required('TRADESAFE_AGENT_TOKEN');
  const d = await gql<{transactionCreate: {id: string; allocations: {id: string}[]}}>(`
    mutation transactionCreate($input: CreateTransactionInput!) {
      transactionCreate(input: $input) { id allocations { id } }
    }`, {
    input: {
      title: o.title.slice(0, 100), description: o.description.slice(0, 1000), industry: 'GENERAL_GOODS_SERVICES', // VERIFY
      currency: 'ZAR', feeAllocation: 'BUYER', workflow: 'STANDARD', reference: o.reference,
      allocations: {create: [{title: o.title.slice(0, 100), description: o.description.slice(0, 1000), value: o.amountZar,
                              daysToDeliver: 7, daysToInspect: o.daysToInspect ?? 2}]},
      parties: {create: [
        {token: o.buyerToken, role: 'BUYER'},
        {token: o.sellerToken, role: 'SELLER'},
        {token: agentToken, role: 'AGENT', fee: o.feePercent, feeType: 'PERCENT', feeAllocation: 'BUYER'},
      ]},
    },
  });
  return {transactionId: d.transactionCreate.id, allocationId: d.transactionCreate.allocations[0]?.id};
}

export async function checkoutLink(transactionId: string) {
  const d = await gql<{checkoutLink: string}>(`query checkoutLink($id: ID!) { checkoutLink(transactionId: $id) }`, {id: transactionId}); // VERIFY
  return d.checkoutLink;
}

export async function transactionState(transactionId: string) {
  const d = await gql<{transaction: {id: string; state: string; allocations: {id: string; state: string}[]}}>(`
    query transaction($id: ID!) { transaction(id: $id) { id state allocations { id state } } }`, {id: transactionId});
  return d.transaction;
}

// Release = the service was delivered and accepted. TradeSafe then pays the worker (and the platform fee).
export async function releaseAllocation(allocationId: string) {
  for (const m of ['allocationStartDelivery', 'allocationCompleteDelivery', 'allocationAcceptDelivery']) {
    try { await gql(`mutation ${m}($id: ID!) { ${m}(id: $id) { id state } }`, {id: allocationId}); }
    catch (e) { if (!/state|already/i.test(String(e))) throw e; } // skip steps that were already done
  }
}

export async function disputeAllocation(allocationId: string) {
  await gql(`mutation allocationDisputeDelivery($id: ID!) { allocationDisputeDelivery(id: $id) { id state } }`, {id: allocationId});
}

export async function cancelTransaction(transactionId: string, comment: string) {
  await gql(`mutation transactionCancel($id: ID!, $comment: String!) { transactionCancel(id: $id, comment: $comment) { id state } }`, {id: transactionId, comment});
}

// TradeSafe transaction state → our payment state. Unknown states leave ours unchanged.
export function mapState(s: string): 'awaiting_payment' | 'funded' | 'released' | 'refunded' | 'disputed' | 'cancelled' | null {
  const t = String(s || '').toUpperCase();
  if (/DISPUTE/.test(t)) return 'disputed';
  if (/FUNDS_RELEASED|COMPLETED|DELIVERY_ACCEPTED/.test(t)) return 'released';
  if (/REFUND/.test(t)) return 'refunded';
  if (/CANCEL/.test(t)) return 'cancelled';
  if (/FUNDS_RECEIVED|FUNDS_DEPOSITED|INITIATED|SENT|DELIVERED/.test(t)) return 'funded';
  if (/CREATED|PENDING/.test(t)) return 'awaiting_payment';
  return null;
}
