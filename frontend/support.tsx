import {useEffect, useRef, useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {
  Bot, Send, Phone, Mail, MessageCircle, Clock, LifeBuoy, Users, ChevronRight, LoaderCircle, Check, ArrowLeft, Inbox,
  ShieldCheck, BookOpen,
} from 'lucide-react';
import {useAccount, modes} from './backend';
import {knowledge, topics, type Entry, type Topic} from './randy-knowledge';

// ---------------------------------------------------------------- contact details (support-config.json, editable on GitHub)
export type SupportConfig = {email?: string; phone?: string; whatsapp?: string; hours?: string};
let cfgPromise: Promise<SupportConfig> | null = null;
export const supportConfig = () => (cfgPromise ??= fetch('./support-config.json', {cache: 'no-cache'}).then(r => (r.ok ? r.json() : {})).catch(() => ({})));
function useSupportConfig() { const [c, setC] = useState<SupportConfig>({}); useEffect(() => { supportConfig().then(setC); }, []); return c; }
const tel = (p: string) => 'tel:' + p.replace(/[^\d+]/g, '');
const wa = (p: string) => 'https://wa.me/' + p.replace(/\D/g, '').replace(/^0/, '27');

// ---------------------------------------------------------------- Randy's brain
const STOP = new Set('a an the i me my we our you your is are was were be been do does did can could how what when where why who which to of in on for and or it this that with at as if not no so am have has had will would should there their them they please hi hello hey'.split(' '));
const SYN: Record<string, string> = {
  paid: 'pay', payment: 'pay', payments: 'pay', money: 'pay', wage: 'pay', wages: 'pay', salary: 'pay', earn: 'pay', earnings: 'pay', payout: 'pay', payouts: 'pay',
  cancelled: 'cancel', cancelling: 'cancel', cancellation: 'cancel', withdraw: 'cancel', drop: 'cancel',
  suspended: 'paused', suspend: 'paused', banned: 'paused', pause: 'paused', blocked: 'block', unblock: 'block',
  login: 'signin', log: 'signin', logon: 'signin', signin: 'signin', password: 'password', pin: 'password',
  job: 'shift', jobs: 'shift', shifts: 'shift', gig: 'shift', gigs: 'shift', booking: 'shift', book: 'pickup', claim: 'pickup', apply: 'pickup',
  employer: 'business', company: 'business', boss: 'business', hire: 'hiring', hiring: 'hiring', worker: 'worker', workers: 'worker', staff: 'worker',
  refunded: 'refund', refunds: 'refund', bank: 'bank', account: 'account', cv: 'cv', resume: 'cv', photo: 'photo', picture: 'photo', avatar: 'photo',
  human: 'person', agent: 'person', someone: 'person', consultant: 'person', phone: 'call', number: 'call', whatsapp: 'call', email: 'email',
  scam: 'scam', fraud: 'scam', fake: 'scam', unsafe: 'unsafe', harassed: 'unsafe', harassment: 'unsafe', abuse: 'unsafe',
};
const stem = (w: string) => SYN[w] ?? SYN[w.replace(/(ing|ed|es|s)$/, '')] ?? w.replace(/(ing|ed|es|s)$/, '');
const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w)).map(stem);
const index = knowledge.map(e => ({e, q: e.q.map(words), k: new Set(words(e.k || '')), a: new Set(words(e.a))}));

export function bestAnswers(text: string): {entry: Entry; score: number}[] {
  const w = words(text);
  if (!w.length) return [];
  const set = new Set(w);
  return index.map(({e, q, k, a}) => {
    let score = 0;
    for (const variant of q) { const hit = variant.filter(x => set.has(x)).length; score = Math.max(score, hit / Math.max(variant.length, 1) * 3 + hit); }
    for (const x of set) { if (k.has(x)) score += 1.2; if (a.has(x)) score += .25; }
    return {entry: e, score};
  }).filter(r => r.score > 1.6).sort((x, y) => y.score - x.score).slice(0, 3);
}

type Live = {strikes?: number; next?: any; mode?: string; payout?: boolean; settings: any};
const fill = (a: string, s: any) => a.replace(/\{fee\}/g, String(s?.platform_fee_percent ?? 10)).replace(/\{strikes\}/g, String(s?.strike_limit ?? 3))
  .replace(/\{grace\}/g, String(s?.cancel_grace_minutes ?? 10)).replace(/\{minwage\}/g, Number(s?.min_hourly_zar ?? 30.23).toFixed(2));

// Questions about the person's own account, answered from live data.
function liveAnswer(text: string, live: Live | null, signedIn: boolean): string | null {
  const t = text.toLowerCase();
  const mine = /\b(my|i|me|do i|have i|am i)\b/.test(t);
  if (!mine) return null;
  if (!signedIn && /strike|next shift|my shift|paid|payout|mode/.test(t)) return 'Sign in and I can check that on your account for you. [Sign in](account.html)';
  if (!live) return null;
  if (/strike/.test(t)) return `You have **${live.strikes ?? 0} of ${live.settings?.strike_limit ?? 3}** strikes right now.${live.strikes ? ' Keeping your shifts (or cancelling within the free window) keeps it from going up.' : ' Nice — keep it that way!'}`;
  if (/next shift|my shift|when do i work|upcoming/.test(t)) return live.next
    ? `Your next shift is **${live.next.title}** on **${new Date(live.next.starts_at).toLocaleString('en-ZA', {timeZone: 'Africa/Johannesburg', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'})}** at ${live.next.address ? live.next.address + ', ' : ''}${live.next.city}. [My shifts](account.html?tab=bookings)`
    : 'You don’t have any upcoming shifts booked. [Find shifts](shifts.html)';
  if (/bank|payout|been paid|my pay status/.test(t)) return live.payout
    ? 'Your bank account is set up, so escrow shifts can pay you. Each shift’s pay status is under [My shifts](account.html?tab=bookings).'
    : 'You haven’t added a bank account yet, so escrow shifts can’t pay you. [Add bank details](account.html?tab=payouts)';
  if (/mode|working or hiring|am i hiring|am i working/.test(t)) return `You’re in **${live.mode === 'business' ? 'Hiring' : 'Working'}** mode. Switch at the top of your [Account](account.html) page.`;
  return null;
}

// [text](link) → buttons, **bold** → bold.
function Rich({text}: {text: string}) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g).filter(Boolean);
  return <>{parts.map((p, i) => {
    const l = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/); if (l) return <a key={i} className="randy-link" href={l[2]}>{l[1]} <ChevronRight size={13}/></a>;
    const b = p.match(/^\*\*(.+)\*\*$/); if (b) return <strong key={i}>{b[1]}</strong>;
    return <span key={i}>{p}</span>;
  })}</>;
}

type Msg = {from: 'randy' | 'me'; text: string; chips?: string[]; handoff?: boolean};
const GREETING = 'Hi, I’m **Randy** 👋 I can help with payments, shifts, strikes, your account, hiring and our rules. Ask me anything, or pick a topic.';

export function RandyChat({onHandoff}: {onHandoff: (question: string) => void}) {
  const acct = useAccount();
  const [msgs, setMsgs] = useState<Msg[]>([{from: 'randy', text: GREETING, chips: ['When do I get paid?', 'How do I pick up a shift?', 'How do strikes work?', 'How do I post a shift?', 'Talk to a person']}]);
  const [text, setText] = useState(''), [typing, setTyping] = useState(false);
  const [live, setLive] = useState<Live | null>(null);
  const lastQ = useRef('');
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!acct.sb) return;
    Promise.all([acct.sb.rpc('public_settings'), acct.session ? acct.sb.rpc('my_summary') : Promise.resolve({data: null})]).then(([{data: s}, {data: sum}]: any) =>
      setLive({settings: s, strikes: acct.profile?.strikes, payout: acct.profile?.payout_ready, mode: acct.profile ? modes(acct.profile).active : undefined, next: sum?.worker?.next}));
  }, [acct.sb, acct.session?.user.id, acct.profile?.strikes]);
  // Keep the start of the newest message in view, so long answers read from the top.
  useEffect(() => {
    const box = list.current, last = box?.lastElementChild as HTMLElement | null;
    if (box && last) box.scrollTo({top: Math.max(0, last.offsetTop - 12), behavior: 'smooth'});
  }, [msgs, typing]);

  function ask(q: string) {
    const question = q.trim(); if (!question) return;
    setText('');
    setMsgs(m => [...m, {from: 'me', text: question}]);
    if (/^talk to a person$|^(speak|talk|chat) (to|with) (a |an )?(human|person|agent|someone)|^(human|agent|person)$/i.test(question)) {
      setMsgs(m => [...m, {from: 'randy', text: 'Sure — I’ll put you in the queue for our support team. Tell us what you need below.', handoff: true}]);
      onHandoff(lastQ.current); return;
    }
    lastQ.current = question;
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      const own = liveAnswer(question, live, !!acct.session);
      if (own) { setMsgs(m => [...m, {from: 'randy', text: own}]); return; }
      const hits = bestAnswers(question);
      if (!hits.length) {
        setMsgs(m => [...m, {from: 'randy', text: 'I’m not sure about that one yet. Pick a topic, try asking another way, or I can hand you to a person.', chips: [...topics.slice(0, 5).map(t => t[1]), 'Talk to a person']}]);
        return;
      }
      const [top, ...more] = hits;
      setMsgs(m => [...m, {from: 'randy', text: fill(top.entry.a, live?.settings), chips: [...more.map(h => h.entry.q[0].replace(/^./, c => c.toUpperCase()) + '?'), 'Talk to a person']}]);
    }, 450 + Math.min(question.length * 8, 600));
  }
  function chip(c: string) {
    const t = topics.find(x => x[1] === c);
    if (t) {
      const entries = knowledge.filter(e => e.topic === t[0]).slice(0, 6);
      setMsgs(m => [...m, {from: 'me', text: c}, {from: 'randy', text: `Here are common questions about **${c.toLowerCase()}**:`, chips: entries.map(e => e.q[0].replace(/^./, x => x.toUpperCase()) + '?')}]);
      return;
    }
    ask(c);
  }

  return (
    <section className="randy card-panel">
      <header className="randy-head">
        <span className="randy-face"><Bot size={26}/></span>
        <div><strong>Randy</strong><small><i className="dot-live"/>Community Work assistant · answers instantly</small></div>
      </header>
      <div className="randy-list" ref={list} aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={'bubble-row ' + m.from}>
            {m.from === 'randy' && <span className="mini-face"><Bot size={15}/></span>}
            <div className="bubble-col">
              <div className={'bubble ' + m.from}><Rich text={m.text}/></div>
              {m.chips && i === msgs.length - 1 && <div className="chip-wrap randy-chips">{m.chips.map(c => <button key={c} onClick={() => chip(c)}>{c === 'Talk to a person' ? <><Users size={13}/>{c}</> : c}</button>)}</div>}
            </div>
          </div>
        ))}
        {typing && <div className="bubble-row randy"><span className="mini-face"><Bot size={15}/></span><div className="bubble randy typing"><i/><i/><i/></div></div>}
      </div>
      <form className="randy-input" onSubmit={e => { e.preventDefault(); ask(text); }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Ask Randy a question…" maxLength={300} aria-label="Ask Randy"/>
        <button className="btn btn-primary" aria-label="Send" disabled={!text.trim()}><Send size={17}/></button>
      </form>
      <button className="link center-link" onClick={() => { setMsgs(m => [...m, {from: 'me', text: 'Talk to a person'}, {from: 'randy', text: 'Sure — I’ll put you in the queue for our support team. Tell us what you need below.', handoff: true}]); onHandoff(lastQ.current); }}><Users size={15}/>Talk to a person instead</button>
    </section>
  );
}

// ---------------------------------------------------------------- support page
const TOPIC_LABEL: Record<string, string> = {account: 'Account', shifts: 'Shifts', payments: 'Payments', hiring: 'Hiring', safety: 'Safety', appeal: 'Appeal', jobs: 'Job listings', other: 'Something else'};
const day = (v: string) => new Date(v).toLocaleString('en-ZA', {timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
const statusLabel = (s: string) => s === 'open' ? 'Waiting for us' : s === 'answered' ? 'We replied' : 'Closed';

export function SupportPage() {
  const acct = useAccount();
  const cfg = useSupportConfig();
  const ticketId = new URLSearchParams(location.search).get('ticket');
  const [handoff, setHandoff] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const startHandoff = (q: string) => { setHandoff(q || ''); setTimeout(() => formRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'}), 50); };

  if (ticketId && acct.ready) return <div className="page reading"><TicketThread id={ticketId} sb={acct.sb} staff={false}/></div>;
  return (
    <div className="page support-page">
      <div className="page-head">
        <p className="overline">Support</p>
        <h1>How can we help?</h1>
        <p className="lede">Ask Randy for an instant answer, or reach a person — we’re here for workers and businesses.</p>
      </div>
      <div className="support-grid">
        <div className="stack">
          <RandyChat onHandoff={startHandoff}/>
          <div ref={formRef}>{handoff !== null && <NewTicket sb={acct.sb} signedIn={!!acct.session} userId={acct.session?.user.id} initial={handoff} onCancel={() => setHandoff(null)}/>}</div>
          <FaqList/>
          <section className="card-panel" id="safety">
            <ShieldCheck size={22}/>
            <h2>Before you agree to work</h2>
            <p className="muted">Confirm who is hiring, the exact workplace, duties, hours and pay. Never pay anyone to get a job, and never share bank logins, PINs or ID documents through a job ad. If something feels wrong, stop and check the employer independently — then tell us.</p>
            <button className="btn btn-outline" onClick={() => startHandoff('')}><Users size={16}/>Report a problem to our team</button>
          </section>
        </div>
        <aside className="stack support-side">
          <ContactCard cfg={cfg}/>
          {acct.session && acct.sb && <MyRequests sb={acct.sb}/>}
          <a className="card-panel rules-card" href="rules.html"><BookOpen size={22}/><div><strong>Community rules</strong><small>Pay, cancellations, strikes, safety and payments — for workers and businesses.</small></div><ChevronRight size={18}/></a>
        </aside>
      </div>
    </div>
  );
}

function ContactCard({cfg}: {cfg: SupportConfig}) {
  return (
    <section className="card-panel contact-card">
      <header className="sec-head"><LifeBuoy size={18}/><div><h2>Contact us</h2><p>{cfg.hours || 'Mon–Fri 08:00–17:00, Sat 09:00–13:00 (SAST)'}</p></div></header>
      {cfg.phone && <a className="contact-row" href={tel(cfg.phone)}><span><Phone size={18}/></span><div><strong>Call us</strong><small>{cfg.phone}</small></div><ChevronRight size={16}/></a>}
      {cfg.whatsapp && <a className="contact-row" href={wa(cfg.whatsapp)} target="_blank" rel="noopener noreferrer"><span><MessageCircle size={18}/></span><div><strong>WhatsApp</strong><small>{cfg.whatsapp}</small></div><ChevronRight size={16}/></a>}
      {cfg.email && <a className="contact-row" href={`mailto:${cfg.email}?subject=${encodeURIComponent('Community Work support')}`}><span><Mail size={18}/></span><div><strong>Email</strong><small>{cfg.email}</small></div><ChevronRight size={16}/></a>}
      <p className="muted small"><ShieldCheck size={13}/> We will never ask for your password, PIN or OTP.</p>
      <p className="muted small">In danger? Call <a className="link" href="tel:10111">10111</a> (SAPS) or <a className="link" href="tel:112">112</a> from a cellphone.</p>
    </section>
  );
}

function NewTicket({sb, signedIn, userId, initial, onCancel}: {sb: SupabaseClient | null; signedIn: boolean; userId?: string; initial: string; onCancel: () => void}) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState('');
  if (!signedIn || !sb || !userId) return (
    <section className="card-panel"><h3>Sign in to join the queue</h3><p className="muted">So we know who you are and can reply here. Not able to sign in? Use the email or phone on this page.</p><a className="btn btn-primary" href="account.html">Sign in</a></section>
  );
  return (
    <form className="card-panel form section-card" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setErr('');
      const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
      const {data, error} = await sb.from('support_tickets').insert({user_id: userId, topic: f.topic, subject: f.subject.trim()}).select('id').single();
      if (error || !data) { setBusy(false); return setErr(/row-level/.test(error?.message || '') ? 'You already have 5 open requests. Please wait for a reply or close one first.' : error?.message || 'Could not send.'); }
      const {error: e2} = await sb.from('support_messages').insert({ticket_id: data.id, author: userId, body: f.body.trim()});
      setBusy(false);
      if (e2) return setErr(e2.message);
      location.href = 'support.html?ticket=' + data.id;
    }}>
      <header className="sec-head"><Users size={18}/><div><h2>Talk to a person</h2><p>You’ll join the queue and see our reply here and on your account.</p></div></header>
      <label className="field">What is it about?<select name="topic" defaultValue="other">{Object.entries(TOPIC_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="field">Short summary<input name="subject" required minLength={3} maxLength={140} defaultValue={initial.slice(0, 140)} placeholder="e.g. My pay for Saturday hasn’t arrived"/></label>
      <label className="field">Tell us more<textarea name="body" rows={5} required minLength={5} maxLength={4000} placeholder="Include the shift, date and what happened. Never share your password, PIN or OTP."/></label>
      {err && <p className="alert">{err}</p>}
      <div className="row-gap start"><button className="btn btn-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : <Send size={17}/>}Join the queue</button><button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

function MyRequests({sb}: {sb: SupabaseClient}) {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { sb.from('support_tickets').select('id, subject, status, topic, last_message_at').order('last_message_at', {ascending: false}).limit(10).then(({data}) => setRows(data || [])); }, []);
  if (!rows?.length) return null;
  return (
    <section className="card-panel">
      <h3><Inbox size={17}/> My support requests</h3>
      {rows.map(t => (
        <a key={t.id} className="ticket-row" href={'support.html?ticket=' + t.id}>
          <div><strong>{t.subject}</strong><small>{TOPIC_LABEL[t.topic] || t.topic} · {day(t.last_message_at)}</small></div>
          <span className={'pill ' + (t.status === 'open' ? 'applied' : t.status === 'answered' ? 'accepted' : '')}>{statusLabel(t.status)}</span>
        </a>
      ))}
    </section>
  );
}

function FaqList() {
  const [topic, setTopic] = useState<Topic>('payments');
  const list = knowledge.filter(e => e.topic === topic);
  const [settings, setSettings] = useState<any>(null);
  const acct = useAccount();
  useEffect(() => { acct.sb?.rpc('public_settings').then(({data}) => setSettings(data)); }, [acct.sb]);
  return (
    <section className="card-panel faq-panel">
      <h2>Common questions</h2>
      <div className="chip-wrap">{topics.map(([k, l]) => <button key={k} className={topic === k ? 'on' : ''} onClick={() => setTopic(k)}>{l}</button>)}</div>
      {list.map(e => <details className="faq" key={e.id}><summary>{e.q[0].replace(/^./, c => c.toUpperCase())}?</summary><p><Rich text={fill(e.a, settings)}/></p></details>)}
    </section>
  );
}

// ---------------------------------------------------------------- one request, for the person and for staff
export function TicketThread({id, sb, staff, onBack}: {id: string; sb: SupabaseClient | null; staff: boolean; onBack?: () => void}) {
  const acct = useAccount();
  const [t, setT] = useState<any>(null), [msgs, setMsgs] = useState<any[]>([]), [pos, setPos] = useState<number | null>(null);
  const [text, setText] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const load = async () => {
    if (!sb) return;
    const {data} = await sb.from('support_tickets').select('*').eq('id', id).maybeSingle();
    setT(data ?? false);
    const {data: m} = await sb.from('support_messages').select('*').eq('ticket_id', id).order('created_at');
    setMsgs(m || []);
    const {data: p} = await sb.rpc('support_queue_position', {p_ticket: id}); setPos(p as any);
  };
  useEffect(() => { load(); const iv = setInterval(load, 20000); return () => clearInterval(iv); }, [id, sb]);
  if (!sb) return null;
  if (t === null) return <div className="card-panel center"><span className="spinner"/></div>;
  if (t === false) return <div className="empty"><h2>Request not found</h2><a className="btn btn-primary" href="support.html">Back to support</a></div>;
  const me = acct.session?.user.id;
  async function send(e: React.FormEvent) {
    e.preventDefault(); if (!text.trim() || !me) return;
    setBusy(true); setErr('');
    const {error} = await sb!.from('support_messages').insert({ticket_id: id, author: me, from_staff: staff, body: text.trim()});
    setBusy(false);
    if (error) return setErr(error.message);
    setText(''); load();
  }
  async function setStatus(status: string) { await sb!.from('support_tickets').update({status}).eq('id', id); load(); }
  return (
    <section className="card-panel ticket">
      {onBack ? <button className="back" onClick={onBack}><ArrowLeft size={17}/>Back to the queue</button> : <a className="back" href="support.html"><ArrowLeft size={17}/>Support</a>}
      <div className="booking-top"><div><p className="overline">{TOPIC_LABEL[t.topic] || t.topic}</p><h2>{t.subject}</h2><p className="muted small">Opened {day(t.created_at)}</p></div>
        <span className={'pill ' + (t.status === 'open' ? 'applied' : t.status === 'answered' ? 'accepted' : '')}>{statusLabel(t.status)}</span></div>
      {!staff && t.status === 'open' && <p className="hint-box"><Clock size={14}/> You’re <strong>number {pos ?? '…'}</strong> in the queue. We’ll reply here — check back or keep this page open.</p>}
      <div className="thread">
        {msgs.map(m => (
          <div key={m.id} className={'bubble-row ' + (m.from_staff ? 'randy' : 'me')}>
            {m.from_staff && <span className="mini-face staff"><LifeBuoy size={15}/></span>}
            <div className="bubble-col"><div className={'bubble ' + (m.from_staff ? 'randy' : 'me')}>{m.body}</div><small className="bubble-time">{m.from_staff ? 'Community Work support · ' : ''}{day(m.created_at)}</small></div>
          </div>
        ))}
      </div>
      {t.status !== 'closed' || staff ? (
        <form className="randy-input" onSubmit={send}>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={2} maxLength={4000} placeholder={staff ? 'Reply to the customer…' : 'Add a message…'} aria-label="Message"/>
          <button className="btn btn-primary" disabled={busy || !text.trim()} aria-label="Send">{busy ? <LoaderCircle className="spin" size={17}/> : <Send size={17}/>}</button>
        </form>
      ) : <p className="muted">This request is closed. Need more help? <a className="link" href="support.html">Start a new one</a>.</p>}
      {err && <p className="alert">{err}</p>}
      <div className="row-gap start">
        {t.status !== 'closed' ? <button className="btn btn-outline btn-sm" onClick={() => setStatus('closed')}><Check size={15}/>{staff ? 'Close request' : 'My problem is solved'}</button>
          : <button className="btn btn-ghost btn-sm" onClick={() => setStatus('open')}>Reopen</button>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- CEO / admin: support queue
export function SupportAdmin({sb}: {sb: SupabaseClient}) {
  const [status, setStatus] = useState('open'), [rows, setRows] = useState<any[] | null>(null), [open, setOpen] = useState<string | null>(null);
  const load = () => sb.rpc('admin_support_queue', {p_status: status}).then(({data, error}) => { if (error) setRows([]); else setRows(data || []); });
  useEffect(() => { setRows(null); load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, [status]);
  if (open) return <TicketThread id={open} sb={sb} staff onBack={() => { setOpen(null); load(); }}/>;
  return (
    <div className="stack">
      <div className="chip-wrap">{[['open', 'Waiting'], ['answered', 'Replied'], ['closed', 'Closed'], ['all', 'All']].map(([k, l]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l}</button>)}</div>
      {!rows ? <div className="card-panel center"><span className="spinner"/></div> : !rows.length ? <div className="empty small"><div className="empty-icon"><Inbox size={26}/></div><h3>Nothing here</h3><p>New requests from the support page appear here, oldest first.</p></div> : (
        <section className="card-panel table-wrap">
          <table><thead><tr><th>#</th><th>Request</th><th>From</th><th>Topic</th><th>Last message</th><th>Status</th></tr></thead>
            <tbody>{rows.map((t, i) => (
              <tr key={t.id} className="clickable" onClick={() => setOpen(t.id)}>
                <td>{t.status === 'open' ? i + 1 : ''}</td>
                <td><strong>{t.subject}</strong><br/><small className="muted">{t.last_message}</small></td>
                <td>{t.name || '—'}<br/><small className="muted">{t.email}</small></td>
                <td>{TOPIC_LABEL[t.topic] || t.topic}</td>
                <td>{day(t.last_message_at)}<br/><small className="muted">{t.messages} message{t.messages == 1 ? '' : 's'}</small></td>
                <td><span className={'pill ' + (t.status === 'open' ? 'applied' : t.status === 'answered' ? 'accepted' : '')}>{statusLabel(t.status)}</span></td>
              </tr>))}</tbody></table>
        </section>
      )}
    </div>
  );
}

