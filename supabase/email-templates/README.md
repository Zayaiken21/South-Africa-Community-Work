# Email templates

Branded emails for sign-up, password reset and the other account emails.

## How to install (5 minutes)

1. Supabase → **Authentication** → **Emails** (or Email Templates).
2. For each template below: open it, paste the **Subject**, switch the body to the HTML/source view, delete what's there,
   paste the whole file, and press **Save**.
3. Send yourself a test: create a new account with a spare email, and use "Forgot password?" on the sign-in page.

| Supabase template | Subject | File |
|---|---|---|
| **Confirm signup** | `Confirm your Community Work account` | `supabase/email-templates/confirm-signup.html` |
| **Reset Password** | `Reset your Community Work password` | `supabase/email-templates/reset-password.html` |
| **Magic Link** | `Your Community Work sign-in link` | `supabase/email-templates/magic-link.html` |
| **Change Email Address** | `Confirm your new email address` | `supabase/email-templates/change-email.html` |
| **Invite user** | `You’re invited to Community Work` | `supabase/email-templates/invite.html` |
| **Reauthentication** | `Your Community Work security code` | `supabase/email-templates/reauthentication.html` |

## Sender name

In the SMTP settings (Authentication → Emails → SMTP), set **Sender name** to `Community Work SA`, so the inbox shows that
name instead of an email address.

## Notes

- `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}`, `{{ .Token }}` and `{{ .Data.full_name }}` are filled in by Supabase. Don't change them.
- The emails say links expire in 1 hour, which is Supabase's default. If you change "Email OTP expiration" in Auth settings, update the wording.
- The logo loads from the live site (`assets/icons/icon-192.png`).
