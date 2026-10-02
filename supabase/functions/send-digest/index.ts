// Daglig sammendrag av varsler på e-post (§5, prompt 11). Kjøres av pg_cron én gang i døgnet (supabase/manual/varsler_epost.sql).
//
// POST med headeren x-cron-secret = CRON_SECRET. Funksjonen er satt opp uten JWT-sjekk (config.toml) og avviser alt annet.
// Henter ett sammendrag per bruker med uleste varsler som skal på e-post (pending_email_digests), sender det via SMTP
// og merker varslene som sendt. Sender også invitasjoner til styreoverføring til e-postadresser uten profil.
// Antall e-poster per kjøring er begrenset (DIGEST_LIMIT, standard 300), så Gmail-grensen på ca. 500 per døgn holder
// også med engangskodene for innlogging.
//
// Miljøvariabler (Edge Function Secrets): CRON_SECRET, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, APP_URL, DIGEST_LIMIT.
// SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY settes av Supabase.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';
import { buildDigestEmail, buildInviteEmail, type DigestItem, type InviteEmail } from '../_shared/digest.ts';

const reply = (body:unknown,status = 200)=>Response.json(body,{ status });

/** Sammenligner hemmeligheten uten å avsløre hvor mange tegn som stemmer. */
function sameSecret(a:string,b:string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i<Math.max(x.length,y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff===0;
}

Deno.serve(async(req)=>{
  if (req.method!=='POST') return reply({ error:'method_not_allowed' },405);
  const secret = Deno.env.get('CRON_SECRET') ?? '';
  if (secret.length<24 || !sameSecret(req.headers.get('x-cron-secret') ?? '',secret)) return reply({ error:'unauthorized' },401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{ auth:{ persistSession:false } });
  const appUrl = Deno.env.get('APP_URL') ?? 'https://nikolaiaskedal.github.io/elevradsnett/';
  const limit = Math.min(Math.max(Number(Deno.env.get('DIGEST_LIMIT') ?? 300) || 300,1),450);
  const port = Number(Deno.env.get('SMTP_PORT') ?? 465);
  const transport = nodemailer.createTransport({
    host:Deno.env.get('SMTP_HOST') ?? 'smtp.gmail.com', port, secure:port===465,
    auth:{ user:Deno.env.get('SMTP_USER')!, pass:Deno.env.get('SMTP_PASS')! },
  });
  const from = Deno.env.get('SMTP_FROM') ?? `Elevrådsnett <${Deno.env.get('SMTP_USER')}>`;

  let sent = 0;
  let failed = 0;
  // Invitasjoner først: de er få og tidskritiske.
  const { data:invites,error:inviteError } = await admin.rpc('pending_handover_invite_emails',{ p_limit:Math.min(100,limit) });
  if (inviteError) return reply({ error:'invites_failed' },500);
  for (const invite of (invites ?? []) as (InviteEmail & { id:string })[]) {
    if (sent>=limit) break;
    try {
      const mail = buildInviteEmail(invite,appUrl);
      await transport.sendMail({ from, ...mail });
      await admin.rpc('mark_handover_invite_emailed',{ p_invite:invite.id });
      sent++;
    } catch { failed++; }
  }

  const { data:digests,error } = await admin.rpc('pending_email_digests',{ p_limit:Math.max(limit-sent,1) });
  if (error) return reply({ error:'digest_failed' },500);
  for (const d of (digests ?? []) as { user_id:string; email:string; display_name:string; items:DigestItem[]; until:string }[]) {
    if (sent>=limit) break;
    try {
      const mail = buildDigestEmail({ to:d.email, name:d.display_name, items:d.items, appUrl });
      await transport.sendMail({ from, ...mail });
      await admin.rpc('mark_email_digest_sent',{ p_user:d.user_id, p_until:d.until });
      sent++;
    } catch { failed++; }
  }
  return reply({ sent, failed });
});
