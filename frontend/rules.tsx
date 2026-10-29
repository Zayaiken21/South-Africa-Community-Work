import {useEffect, useState} from 'react';
import {Users, UserRound, Building2, Clock, CalendarX2, Wallet, ShieldAlert, Gavel, BookOpen, LifeBuoy, Scale} from 'lucide-react';
import {backend} from './backend';

type S = {min_hourly_zar: number; platform_fee_percent: number; strike_limit: number; cancel_grace_minutes: number};
const DEF: S = {min_hourly_zar: 30.23, platform_fee_percent: 10, strike_limit: 3, cancel_grace_minutes: 10};
const R = (v: number) => 'R' + v.toFixed(2).replace('.', ',');

function Rule({n, title, children}: {n: string; title: string; children: React.ReactNode}) {
  return <li className="rule"><span className="rule-n">{n}</span><div><strong>{title}</strong><p>{children}</p></div></li>;
}

export function RulesPage() {
  const [s, setS] = useState<S>(DEF);
  useEffect(() => { backend().then(sb => sb?.rpc('public_settings').then(({data}) => data && setS({...DEF, ...(data as any)}))); }, []);
  const sections: [string, string, React.ComponentType<{size?: number}>][] = [
    ['everyone', 'Everyone', Users], ['worker', 'Workers', UserRound], ['business', 'Businesses', Building2], ['pay', 'Pay & hours', Clock],
    ['cancel', 'Cancelling & strikes', CalendarX2], ['payments', 'Payments & disputes', Wallet], ['safety', 'Safety', ShieldAlert], ['enforcement', 'When rules are broken', Gavel]];
  return (
    <div className="page reading rules-page">
      <div className="page-head">
        <p className="overline"><BookOpen size={14}/> Community rules</p>
        <h1>Fair work, both ways.</h1>
        <p className="lede">These rules keep shifts reliable for businesses and fair for workers. They follow South African labour law and the problems that actually happen on shift apps — late cancellations, no-shows, unpaid hours and unsafe sites. Last updated 28 October 2026.</p>
      </div>
      <nav className="chip-wrap rules-nav" aria-label="Sections">{sections.map(([id, l, Icon]) => <a key={id} href={'#' + id}><Icon size={14}/>{l}</a>)}</nav>

      <section className="card-panel" id="everyone">
        <h2><Users size={20}/> For everyone</h2>
        <ol className="rules">
          <Rule n="1" title="You must be 18 or older">Shift work on Community Work is for adults only. South African law forbids employing children under 15, and we keep the whole platform 18+.</Rule>
          <Rule n="2" title="One real account per person">Use your real name and details. Don’t share your account or let someone else work a shift under your name — the business booked <em>you</em>.</Rule>
          <Rule n="3" title="Respect, always">No harassment, threats, insults, sexual comments or discrimination based on race, gender, religion, disability, nationality, sexual orientation, HIV status or anything else. One serious incident is enough for a ban.</Rule>
          <Rule n="4" title="Nobody pays to work">Businesses may never charge workers for a shift, “registration”, training, uniforms or a place on a list. Workers should report any request like this — it’s almost always a scam.</Rule>
          <Rule n="5" title="Keep it honest">No fake shifts, fake profiles, false no-show reports, fake hours or invented reviews of others. Say what the job really is, where it is and what it pays.</Rule>
          <Rule n="6" title="Protect personal information">Use what you learn about each other (phone numbers, addresses, CVs) only for the shift. Under POPIA you may not share it, sell it or use it to contact people for other reasons.</Rule>
          <Rule n="7" title="Talk early">Plans change — say so as soon as you know. Most problems on shift apps come from silence, not bad intent.</Rule>
        </ol>
      </section>

      <section className="card-panel" id="worker">
        <h2><UserRound size={20}/> For workers</h2>
        <ol className="rules">
          <Rule n="1" title="Only book what you will work">Picking up a shift is a promise. Check the date, start time, travel time and pay before you tap Pick up.</Rule>
          <Rule n="2" title="Arrive 10 minutes early, ready to work">Bring what the shift asks for (ID, black shoes, safety boots, etc.) and ask for the contact person named in the shift.</Rule>
          <Rule n="3" title="Can’t make it? Cancel in the app, as early as possible">Cancelling within {s.cancel_grace_minutes} minutes of picking up a shift is free. After that it’s a strike. Not cancelling and simply not arriving is a no-show — the worst thing for a business that’s counting on you.</Rule>
          <Rule n="4" title="Work safely and follow site rules">Wear the protective equipment you’re given, follow reasonable instructions and stop if something is dangerous — then tell the business and us.</Rule>
          <Rule n="5" title="No alcohol or drugs on shift">Arriving under the influence means the business can send you home unpaid, and it counts as a no-show.</Rule>
          <Rule n="6" title="Record the truth">Your hours should match what you worked. If the business records the wrong hours, use Report a problem before pay is released.</Rule>
          <Rule n="7" title="Keep your money safe">Add your own bank account for payouts. We will never ask for your password, PIN or OTP.</Rule>
        </ol>
      </section>

      <section className="card-panel" id="business">
        <h2><Building2 size={20}/> For businesses</h2>
        <ol className="rules">
          <Rule n="1" title="Describe the shift honestly">Real duties, exact address, dress code, what to bring, who to report to, and whether there’s parking or transport. If it changes, tell booked workers straight away.</Rule>
          <Rule n="2" title="Pay at least the minimum wage — and on time">No shift can be posted below {R(s.min_hourly_zar)} an hour (the national minimum wage). Release escrow pay within 24 hours of the shift ending, or pay cash at the end of the shift.</Rule>
          <Rule n="3" title="Pay for the time worked, not less">If a worker arrives and you send them home early or there isn’t enough work, pay at least 4 hours — as the law requires for anyone working under 4 hours in a day. No unpaid “trial shifts”.</Rule>
          <Rule n="4" title="No deductions without written agreement">You may not take money off a worker’s pay for breakages, shortages, uniforms or meals unless the law allows it or they agreed in writing.</Rule>
          <Rule n="5" title="Release workers only for a real reason, and early">Releasing a worker is not a strike against them, but it hurts their income. Repeated releases within 12 hours of a shift will get your account reviewed.</Rule>
          <Rule n="6" title="Mark no-shows only when someone really didn’t come">A no-show gives the worker a strike. False no-show reports are treated as dishonesty.</Rule>
          <Rule n="7" title="Provide a safe workplace">Give the protective equipment the job needs, explain the risks and keep first aid available. You are responsible for health and safety at your site.</Rule>
          <Rule n="8" title="Your legal duties as the employer">You’re the employer for the shift. That includes paying the worker correctly, keeping a record of their hours and pay, COIDA cover for injuries at work, and registering for UIF for anyone who works more than 24 hours a month for you.</Rule>
          <Rule n="9" title="Hire on merit">Choose workers based on the job. Refusing someone because of race, gender, religion, pregnancy, disability, nationality or similar grounds is unfair discrimination and against the law.</Rule>
        </ol>
      </section>

      <section className="card-panel" id="pay">
        <h2><Clock size={20}/> Pay & hours</h2>
        <p className="muted">Based on the Basic Conditions of Employment Act and the National Minimum Wage Act. Some rules don’t apply to very high earners or people working under 24 hours a month for one employer, but they’re the fair standard on Community Work.</p>
        <div className="table-wrap"><table className="rules-table"><tbody>
          <tr><th>Minimum pay</th><td>{R(s.min_hourly_zar)} an hour (national minimum wage, from 1 March 2026). Workers get the full rate — the {s.platform_fee_percent}% service fee is paid by the business on top.</td></tr>
          <tr><th>Shift length</th><td>4 to 12 hours. Anyone working under 4 hours in a day is paid for 4.</td></tr>
          <tr><th>Normal hours</th><td>Up to 9 hours a day (8 if they work more than 5 days a week) and 45 hours a week.</td></tr>
          <tr><th>Overtime</th><td>Only by agreement, at most 10 hours a week, paid at 1.5× the hourly rate. No day longer than 12 hours.</td></tr>
          <tr><th>Meal break</th><td>A break of 1 hour after 5 hours of work (can be 30 minutes by agreement).</td></tr>
          <tr><th>Rest</th><td>12 hours off between shifts and 36 hours off in a row each week.</td></tr>
          <tr><th>Sundays</th><td>Double pay (1.5× if the worker normally works Sundays).</td></tr>
          <tr><th>Public holidays</th><td>Double pay — and only if the worker agrees to work.</td></tr>
          <tr><th>Night work</th><td>Between 18:00 and 06:00: by agreement, with an extra allowance or fewer hours, and safe transport home.</td></tr>
          <tr><th>Tips</th><td>Tips belong to the worker.</td></tr>
        </tbody></table></div>
      </section>

      <section className="card-panel" id="cancel">
        <h2><CalendarX2 size={20}/> Cancelling & strikes</h2>
        <ol className="rules">
          <Rule n="1" title="Free cancel window">Workers can cancel within {s.cancel_grace_minutes} minutes of picking up a shift without a strike — for when you tap the wrong one.</Rule>
          <Rule n="2" title="What gives a strike">Cancelling a booked shift after that window, or not showing up. A business releasing you, cancelling the shift, or our team cancelling it is never your strike.</Rule>
          <Rule n="3" title={`${s.strike_limit} strikes pauses your account`}>At {s.strike_limit} strikes your account is paused: you can’t pick up shifts until you appeal and our team approves it. After an approved appeal your strikes reset.</Rule>
          <Rule n="4" title="Emergencies happen">Illness, a family emergency, a taxi strike or load-shedding chaos — cancel in the app and send us a message or appeal with the details. We remove strikes for genuine emergencies.</Rule>
          <Rule n="5" title="Wrong strike?">If you worked the shift or were wrongly marked as a no-show, contact support with the time you arrived and who you spoke to. We check with both sides and remove wrong strikes.</Rule>
          <Rule n="6" title="Businesses cancel too">If a business deletes or releases a booked shift, escrow money is refunded and the worker isn’t penalised. Businesses that cancel often lose access to posting.</Rule>
        </ol>
      </section>

      <section className="card-panel" id="payments">
        <h2><Wallet size={20}/> Payments & disputes</h2>
        <ol className="rules">
          <Rule n="1" title="Escrow protects both sides">With escrow, the business pays before the shift and TradeSafe — an independent South African escrow company — holds the money. Neither Community Work nor the business can touch it until the shift is done.</Rule>
          <Rule n="2" title="Releasing pay">After the shift, the business records the hours and releases pay. It goes to the worker’s bank account, usually within a few working days.</Rule>
          <Rule n="3" title="Refunds">If a worker cancels, doesn’t show, or is released before the shift, that booking’s escrow money goes back to the business.</Rule>
          <Rule n="4" title="Disputes">Either side can tap Report a problem. The money stays held while our team reviews the hours, messages and both explanations, then releases it to the worker or refunds the business. We aim to decide within 3 working days.</Rule>
          <Rule n="5" title="Cash shifts">The business pays the worker in full, in person, at the end of the shift, and both confirm it in the app. We can’t recover cash, so escrow is recommended.</Rule>
          <Rule n="6" title="Don’t move escrow shifts off the app">Asking a worker to skip escrow and take cash “to save the fee” removes their protection and is not allowed.</Rule>
        </ol>
      </section>

      <section className="card-panel" id="safety">
        <h2><ShieldAlert size={20}/> Safety</h2>
        <ol className="rules">
          <Rule n="1" title="Leave if you feel unsafe">No shift is worth your safety. Leave, then tell us — you won’t get a strike for leaving a genuinely unsafe situation.</Rule>
          <Rule n="2" title="Meet at the workplace">Shifts happen at the business address in the listing. Don’t get into a stranger’s car or go to a different address you weren’t told about.</Rule>
          <Rule n="3" title="Report injuries">If you’re hurt on shift, get help first, then tell the business and us. The business must report work injuries under COIDA.</Rule>
          <Rule n="4" title="Emergencies">Call <a className="link" href="tel:10111">10111</a> (police) or <a className="link" href="tel:112">112</a> from any cellphone. For ambulances, 10177.</Rule>
        </ol>
      </section>

      <section className="card-panel" id="enforcement">
        <h2><Gavel size={20}/> When rules are broken</h2>
        <p>We look at what happened and hear both sides. Depending on how serious it is: a warning, a strike, losing access to posting or picking up shifts, or a permanent ban. Violence, threats, sexual harassment, fraud, or charging workers to work lead to an immediate ban and may be reported to the police. You can appeal any decision through <a className="link" href="support.html">Support</a>.</p>
        <p className="muted small"><Scale size={13}/> These rules summarise our policies and South African labour law in plain language. They’re not legal advice. For your rights at work you can also contact the Department of Employment and Labour or the CCMA.</p>
      </section>

      <a className="card-panel rules-card" href="support.html"><LifeBuoy size={22}/><div><strong>Questions about a rule?</strong><small>Ask Randy or talk to our support team.</small></div></a>
    </div>
  );
}
