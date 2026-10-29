// Randy's knowledge: every answer Randy can give. Each entry has the ways people ask (q), extra search words (k) and the answer (a).
// Answers may use {fee}, {strikes}, {grace}, {minwage} — filled in live from the platform settings.
// Links in answers use [text](page.html) and are shown as buttons.

export type Topic = 'start' | 'account' | 'working' | 'hiring' | 'shifts' | 'payments' | 'rules' | 'safety' | 'jobs' | 'support';
export type Entry = {id: string; topic: Topic; q: string[]; k?: string; a: string};

export const topics: [Topic, string][] = [
  ['payments', 'Payments'], ['shifts', 'Shifts'], ['working', 'Working'], ['hiring', 'Hiring'], ['account', 'Account'],
  ['rules', 'Rules'], ['safety', 'Safety'], ['jobs', 'Job listings'], ['support', 'Support'],
];

export const knowledge: Entry[] = [
  // ---------------------------------------------------------------- getting started
  {id: 'what', topic: 'start', q: ['what is community work', 'how does this work', 'what can i do here', 'how does the app work'], k: 'about platform explain',
    a: 'Community Work connects people in South Africa with paid work. **Workers** pick up paid shifts near them and get paid per hour. **Businesses** post shifts, book workers and pay safely through escrow. There are also in-person jobs from employers across SA and online jobs you can do from home. [How it works](how-it-works.html)'},
  {id: 'signup', topic: 'account', q: ['how do i sign up', 'create an account', 'register', 'make an account', 'join'], k: 'new account registration',
    a: 'Tap **Account → Create account**, choose **Find work** or **Hire workers**, add your name, email and a password (10+ characters), then tap the link in the confirmation email. You must be 18 or older. [Create account](account.html?signup=1)'},
  {id: 'cost', topic: 'start', q: ['is it free', 'how much does it cost', 'do i pay to use', 'is there a fee for workers'], k: 'price free charge cost',
    a: 'It’s **free for workers** — you never pay to find or pick up work, and you receive the full hourly rate. Businesses pay a **{fee}% service fee** on escrow shifts, on top of what they pay the worker. Cash shifts have no fee.'},

  // ---------------------------------------------------------------- account
  {id: 'no-email', topic: 'account', q: ['i did not get the email', 'confirmation email not arriving', 'no verification email', 'email not received'], k: 'confirm verify spam inbox link',
    a: 'Check your **spam/junk** and **promotions** folders for an email from Community Work. Emails can take a few minutes. If it still hasn’t arrived after 15 minutes, try signing up or resetting your password again, or **talk to a person** and we’ll confirm your account.'},
  {id: 'reset', topic: 'account', q: ['forgot my password', 'reset password', 'change my password', 'cant sign in'], k: 'login sign in password locked out',
    a: 'On the sign-in page tap **Forgot password?**, enter your email and use the link we send you to choose a new password. Signed in already? Go to **Account → Settings → Sign-in** to change it. [Sign in](account.html)'},
  {id: 'signin-nothing', topic: 'account', q: ['sign in does nothing', 'stuck on sign in', 'sign in button not working', 'it keeps showing sign in'], k: 'login problem broken',
    a: 'First confirm your email (look for our email, including spam). Then reload the page with a fresh copy: close the app or tab and open it again. If you see “profile couldn’t be loaded”, tap **Try again** — if it keeps happening, **talk to a person** and we’ll fix your account.'},
  {id: 'modes', topic: 'account', q: ['switch to hiring', 'switch to working', 'can i work and hire', 'two accounts', 'working mode hiring mode'], k: 'mode dual switch business worker toggle',
    a: 'One account can do both, **one mode at a time**. Use the **Working | Hiring** switch at the top of your Account page. Working shows your shifts, earnings and payouts; Hiring shows your business shifts, workers and payments. The first switch to Hiring asks for your business name.'},
  {id: 'profile', topic: 'account', q: ['edit my profile', 'change profile photo', 'add a photo', 'change theme', 'profile colour'], k: 'picture avatar theme bio skills',
    a: 'Go to **Account → Profile**. Add a photo (we crop it into a circle), pick a colour theme, write a short description, and add skills, experience, availability and languages. In Hiring mode you edit your **business** logo and details instead — workers never see your personal profile. [My profile](account.html?tab=profile)'},
  {id: 'who-sees', topic: 'account', q: ['who can see my profile', 'who sees my phone number', 'who sees my cv', 'privacy of my details'], k: 'private visible personal information',
    a: 'Signed-in members can see your profile. Your **phone number** is only shown to people you’re booked with, and your **CV** only to businesses whose shifts you pick up and our support team. Businesses only show their business page, never the owner’s personal profile. [Privacy](privacy.html)'},
  {id: 'cv', topic: 'account', q: ['upload my cv', 'add resume', 'build a cv', 'i dont have a cv'], k: 'resume curriculum vitae pdf word',
    a: 'Upload a PDF or Word CV (up to 5 MB) under **Account → Profile → CV**. No CV yet? Use our free [CV builder](cv-builder.html) — it makes a PDF or Word file you can upload.'},
  {id: 'two-step', topic: 'account', q: ['two step sign in', 'authenticator app', '2fa', 'extra security code'], k: 'mfa totp code security',
    a: 'Two-step sign-in is **optional**. Turn it on under **Account → Settings → Two-step sign-in** and scan the QR code with Google Authenticator, Microsoft Authenticator or Authy. After that, signing in needs your password and a 6-digit code from your phone.'},
  {id: 'delete', topic: 'account', q: ['delete my account', 'close my account', 'remove my data'], k: 'erase personal information popia',
    a: 'We can delete your account and everything in it. **Talk to a person** from this page (signed in, so we know it’s you) or email us from your account’s email address. If you have shifts or money still in escrow, we finish those first.'},
  {id: 'location', topic: 'account', q: ['location not working', 'wrong area', 'change my area', 'set my location'], k: 'gps city town distance',
    a: 'Tap your area at the top of the jobs or shifts page to choose a city or search an address. If “use my location” doesn’t work, allow location for this site in your phone settings, or just pick your town. Distances are shown in miles.'},

  // ---------------------------------------------------------------- working: shifts
  {id: 'pickup', topic: 'shifts', q: ['how do i get a shift', 'how do i pick up a shift', 'how to book a shift', 'apply for a shift'], k: 'book find work job claim',
    a: 'Open **Shifts**, choose your area and distance, and tap **Pick up** on a shift you want. You’re booked straight away — no waiting to be chosen. You’ll then see the exact address and the business’s phone number under **Account → My shifts**. [Find shifts](shifts.html)'},
  {id: 'cant-see', topic: 'shifts', q: ['why cant i see shifts', 'no shifts showing', 'shifts disappeared', 'a shift is missing'], k: 'empty hidden gone',
    a: 'Shifts disappear when all spots are taken, and come back if someone cancels. Try a bigger distance. You also won’t see shifts from a business that released or blocked you, your own business’s shifts, or any shifts while your account is paused or in **Hiring** mode.'},
  {id: 'cancel', topic: 'shifts', q: ['how do i cancel a shift', 'cancel my booking', 'i cant make my shift', 'withdraw from a shift'], k: 'cancellation drop',
    a: 'Go to **Account → My shifts → Cancel shift**. Cancelling within **{grace} minutes** of picking it up is free. After that it counts as a **strike** — {strikes} strikes pauses your account until an appeal is approved. Please cancel as early as possible so the business can find someone else.'},
  {id: 'strikes', topic: 'shifts', q: ['what is a strike', 'how do strikes work', 'why did i get a strike', 'how many strikes before ban'], k: 'penalty reliability suspended paused',
    a: 'You get a **strike** when you cancel a shift you picked up (after the free {grace}-minute window) or don’t show up. At **{strikes} strikes** your account is paused until our team approves an appeal; the count then starts again. A business releasing you is **never** a strike.'},
  {id: 'appeal', topic: 'shifts', q: ['my account is paused', 'how do i appeal', 'account suspended', 'unban me'], k: 'appeal suspension restore',
    a: 'Open your **Account** page — when it’s paused you’ll see a form to send an appeal. Explain what happened (for example illness or transport problems) and what you’ll do differently. Our team reviews every appeal and replies on the same page. Permanently closed accounts can’t appeal.'},
  {id: 'released', topic: 'shifts', q: ['business released me', 'i was removed from a shift', 'why was i released'], k: 'release removed declined',
    a: 'A business can release you before a shift starts (for example if plans change). It is **not** a strike against you, and any escrow money goes back to the business. You can’t re-book that same shift, but every other shift is still open to you.'},
  {id: 'no-show', topic: 'shifts', q: ['marked as no show', 'i was marked absent', 'wrong no show'], k: 'noshow absent missed',
    a: 'If a business marks you as a no-show, it counts as a strike. If you did work the shift or it was a mistake, **talk to a person** straight away with the details (time you arrived, who you spoke to). We check with the business and remove wrong strikes.'},
  {id: 'hours', topic: 'shifts', q: ['confirm my hours', 'hours worked wrong', 'how are hours recorded'], k: 'timesheet hours confirm',
    a: 'After the shift the business records the hours. You’ll see **Confirm X hours** under **My shifts** — tap it if it’s right. If it’s wrong, don’t confirm: tap **Report a problem** or talk to a person, and the money stays held until it’s sorted.'},
  {id: 'arrive', topic: 'shifts', q: ['what should i bring', 'what to wear', 'where do i go for my shift', 'running late'], k: 'arrive late dress code address',
    a: 'Check the shift description for dress code and what to bring, and arrive 10–15 minutes early. The exact address and the business’s phone number are under **Account → My shifts** once you’re booked. Running late? Phone the business straight away.'},
  {id: 'multiple', topic: 'shifts', q: ['can i book two shifts', 'overlapping shifts', 'book many shifts'], k: 'double booking same time',
    a: 'You can book as many shifts as you like, as long as they don’t overlap in time. We stop double-bookings automatically.'},

  // ---------------------------------------------------------------- payments
  {id: 'when-paid', topic: 'payments', q: ['when do i get paid', 'how long until i am paid', 'when will my money come', 'have i been paid'], k: 'payment payout salary wage money release',
    a: 'For **escrow shifts**, the business pays into escrow when you’re booked. After the shift, the business confirms your hours and releases the pay, and it goes straight to your bank account — usually within a few working days, depending on your bank. **Cash shifts** are paid by the business in person. Check **Account → My shifts** for each shift’s pay status.'},
  {id: 'escrow', topic: 'payments', q: ['what is escrow', 'is my money safe', 'how does escrow work', 'who holds the money'], k: 'tradesafe trust secure held',
    a: 'Escrow means the business pays the shift money **before** you work, and an independent South African escrow company (TradeSafe) holds it — not Community Work and not the business. It’s released to the worker once the hours are confirmed. If there’s a problem, the money stays held until it’s resolved.'},
  {id: 'payout-setup', topic: 'payments', q: ['add my bank account', 'set up payouts', 'change bank details', 'where does my pay go'], k: 'bank account payout details fica',
    a: 'Go to **Account → Get paid** (in Working mode) and add your name as on your ID, SA ID number, mobile number and bank account. These go to TradeSafe to meet South African FICA rules; we only keep the last four digits. [Get paid](account.html?tab=payouts)'},
  {id: 'paypal', topic: 'payments', q: ['can i be paid with paypal', 'cash app', 'wise', 'pay me in another way'], k: 'paypal cashapp wise ewallet crypto',
    a: 'Escrow pay goes to a **South African bank account** — that’s how licensed escrow works here. Cash App isn’t available in South Africa, and PayPal or Wise can’t hold escrow. If you and the business agree, a shift can be paid in **cash** instead.'},
  {id: 'fees', topic: 'payments', q: ['what is the service fee', 'how much does hiring cost', 'what do businesses pay'], k: 'fee commission percentage cost',
    a: 'Businesses pay the worker’s full hourly rate plus a **{fee}% service fee** on escrow shifts. Workers never pay a fee. Cash shifts have no fee.'},
  {id: 'dispute', topic: 'payments', q: ['problem with my pay', 'report a problem', 'wrong amount', 'dispute a payment', 'not paid correctly'], k: 'dispute complaint underpaid',
    a: 'On the shift, tap **Report a problem**. The money stays held in escrow while our team looks at what happened (hours, messages, both sides’ explanation) and then releases it to the worker or refunds the business. You can also **talk to a person** here.'},
  {id: 'refund', topic: 'payments', q: ['how do refunds work', 'worker cancelled will i get my money back', 'refund for no show'], k: 'refund money back business',
    a: 'If a worker cancels, doesn’t show up, or you release them, the escrow payment for that booking is **refunded to the business**. If you paid but the shift was cancelled before it started, it’s refunded too. Refunds go back through TradeSafe to how you paid.'},
  {id: 'cash', topic: 'payments', q: ['how do cash shifts work', 'paid in cash', 'mark as paid in cash'], k: 'cash hand',
    a: 'On cash shifts the business pays the worker in person at the end of the shift, then taps **Mark paid in cash** so it’s recorded. We can’t recover unpaid cash, so for bigger shifts we recommend escrow.'},
  {id: 'minwage', topic: 'payments', q: ['minimum wage', 'how much must i be paid', 'lowest hourly rate'], k: 'minimum pay rate per hour law',
    a: 'Every shift pays at least the national minimum wage: **R{minwage} an hour** (from 1 March 2026). Shifts are at least 4 hours, because by law anyone who works less than 4 hours in a day must be paid for 4.'},
  {id: 'overtime', topic: 'payments', q: ['overtime pay', 'sunday pay', 'public holiday pay', 'night shift pay'], k: 'overtime sunday holiday night extra',
    a: 'South African law (BCEA) for most employees: overtime is paid at **1.5×**, Sunday work at **2×** (1.5× if you normally work Sundays), public holidays at **2×**, and night work (18:00–06:00) needs an allowance or shorter hours plus transport. Businesses must include these in the hourly rate they set for such shifts. [Community rules](rules.html)'},

  // ---------------------------------------------------------------- hiring
  {id: 'post', topic: 'hiring', q: ['how do i post a shift', 'hire someone', 'add a job', 'how do i hire workers'], k: 'post create shift job hire',
    a: 'Switch to **Hiring** mode, open **Post a shift**, add the title, what the worker will do, the workplace location, date, start and end time (4–12 hours) and pay per hour (at least R{minwage}). Choose escrow or cash, then post. Nearby workers can pick it up straight away. [Post a shift](account.html?tab=post)'},
  {id: 'pay-escrow', topic: 'hiring', q: ['how do i pay a worker', 'pay into escrow', 'finish paying', 'how do i fund a shift'], k: 'fund checkout pay worker',
    a: 'When a worker picks up your escrow shift, tap **Pay into escrow** on that booking (under **Shifts**). You’ll pay securely through TradeSafe. The first time, TradeSafe asks for your name, ID number and mobile (FICA). After the shift, record the hours and tap **Release pay**.'},
  {id: 'release-pay', topic: 'hiring', q: ['release pay', 'pay the worker after the shift', 'record hours'], k: 'release payment confirm hours',
    a: 'After the shift starts, tap **Record hours** on the worker, enter the hours worked, then tap **Release pay**. If fewer hours were worked than booked, our team releases the right amount and refunds the rest.'},
  {id: 'release-worker', topic: 'hiring', q: ['remove a worker', 'release a worker', 'i dont want this worker'], k: 'release decline remove unbook',
    a: 'Before the shift starts, tap **Release worker** on their booking. The spot opens for others and any escrow payment is refunded to you. Releasing isn’t a strike against the worker. Please only release for a real reason and as early as possible.'},
  {id: 'block', topic: 'hiring', q: ['block a worker', 'never see this worker again', 'stop someone booking my shifts', 'unblock'], k: 'block ban worker',
    a: 'Tap **Block** on the worker in your Shifts list, or **Block from my shifts** on their profile. They won’t see or book any of your shifts again. Manage blocks under **Account → Settings → Blocked workers**, where you can unblock them.'},
  {id: 'no-show-biz', topic: 'hiring', q: ['worker did not show up', 'worker never arrived', 'mark no show'], k: 'noshow absent',
    a: 'After the start time, tap **No-show** on the worker. It counts as a strike on their account and any escrow payment is refunded to you. Only mark a no-show if they really didn’t come — false no-shows can lead to your account being reviewed.'},
  {id: 'delete-shift', topic: 'hiring', q: ['delete a shift', 'cancel my shift as a business', 'remove my job post'], k: 'delete remove cancel post',
    a: 'Under **Shifts**, tap **Delete shift** on any shift nobody has worked or been paid for. It’s removed completely. If a worker is booked, release them first (you’ll be refunded), then delete.'},
  {id: 'employer-duties', topic: 'hiring', q: ['am i the employer', 'uif for shift workers', 'who is responsible for the worker', 'coida injury'], k: 'uif coida employer responsibility tax paye',
    a: 'The business that books the worker is their employer for that shift and is responsible for lawful pay, a safe workplace, and — where they apply — UIF, COIDA and PAYE. Workers who work 24 hours or more in a month for you must be registered for UIF. Community Work is a marketplace and doesn’t employ the workers. [Community rules](rules.html)'},
  {id: 'verified', topic: 'hiring', q: ['how do i get verified', 'what is the verified badge', 'blue tick'], k: 'verify badge check trusted',
    a: 'The ✓ verified badge means our team has checked the account (for businesses: that it’s a real business; for workers: identity and good standing). To ask for verification, **talk to a person** and choose “Account”.'},

  // ---------------------------------------------------------------- jobs
  {id: 'job-listings', topic: 'jobs', q: ['where do the jobs come from', 'how do i apply for a job', 'in person jobs', 'online jobs'], k: 'listings employer apply external',
    a: 'Besides shifts posted here, **in-person jobs** come straight from South African employers’ own careers pages, and **online jobs** from remote job boards. Tap **Apply** to open the original advert and apply there — those applications go to the employer, not through us. New jobs are added every 3 hours.'},
  {id: 'saved', topic: 'jobs', q: ['saved jobs', 'how do i save a job', 'my saved jobs disappeared'], k: 'bookmark save',
    a: 'Tap the bookmark on any job to save it. Saved jobs are kept on this device (not your account), so they won’t appear on another phone, and clearing your browser data removes them.'},
  {id: 'scam', topic: 'safety', q: ['is this job a scam', 'they asked me to pay', 'fake job', 'someone asked for money'], k: 'scam fraud fake pay to work',
    a: '**Never pay to get a job**, and never share bank logins, PINs or OTPs. Real employers don’t ask for “registration fees”, training fees or uniforms paid in advance. If a job or person asks for money, stop and report it to us — **talk to a person** with the details.'},

  // ---------------------------------------------------------------- safety
  {id: 'unsafe', topic: 'safety', q: ['i feel unsafe', 'harassment at work', 'report a business', 'report a worker', 'someone was abusive'], k: 'harassment abuse unsafe report danger',
    a: 'If you’re in danger, call **10111** (SAPS) or **112** from a cellphone. Then report it to us: **talk to a person** and choose “Safety” — we treat these first. We can pause accounts, block people from each other and help with records. Harassment, discrimination and threats break our rules and lead to removal.'},
  {id: 'injury', topic: 'safety', q: ['i got injured at work', 'accident on shift', 'hurt at work'], k: 'injury accident hurt coida medical',
    a: 'Get medical help first. Tell the business straight away — as your employer for that shift they must report workplace injuries under COIDA. Then tell us (**talk to a person**, choose “Safety”) so we can support you and keep a record.'},

  // ---------------------------------------------------------------- rules
  {id: 'rules', topic: 'rules', q: ['what are the rules', 'community rules', 'rules for workers', 'rules for businesses'], k: 'policy terms guidelines conduct',
    a: 'Our **Community rules** cover pay (minimum wage, 4–12 hour shifts, overtime), cancellations and strikes, no-shows, safety, respect, payments and disputes — for workers and businesses. [Read the rules](rules.html)'},
  {id: 'age', topic: 'rules', q: ['how old do i need to be', 'can i work under 18', 'minimum age'], k: 'age child teenager',
    a: 'You must be **18 or older** to use Community Work as a worker or a business.'},
  {id: 'foreign', topic: 'rules', q: ['can foreigners work', 'work permit', 'i am not south african'], k: 'foreign national permit visa',
    a: 'Anyone working shifts must be allowed to work in South Africa (a South African ID, or a valid permit or visa that allows work). Escrow payouts also need a South African bank account.'},

  // ---------------------------------------------------------------- support
  {id: 'contact', topic: 'support', q: ['talk to a person', 'contact support', 'speak to someone', 'customer service number', 'email support', 'call you'], k: 'human agent help phone email whatsapp',
    a: 'Tap **Talk to a person** below and we’ll put you in the queue — you’ll see your place in line and our reply right here. You can also call or email us using the contact details on this page.'},
  {id: 'queue', topic: 'support', q: ['where is my support request', 'how long until someone answers', 'my ticket'], k: 'queue waiting reply request',
    a: 'Your requests are under **My support requests** on this page, with your place in the queue. We answer in the order requests arrive. If you’re in danger, call 10111 or 112 first.'},
  {id: 'install', topic: 'support', q: ['install the app', 'download the app', 'is there an app'], k: 'android iphone play store home screen',
    a: 'On Android, open the menu and tap **Install the app** (or “Add to Home screen”). On iPhone, tap **Share → Add to Home Screen**. It works like an app, even with a weak connection.'},
];
