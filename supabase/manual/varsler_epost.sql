-- Prompt 11: planlegg det daglige e-postsammendraget i pilotprosjektet. Kjøres én gang i SQL Editor i Supabase,
-- etter at migrasjonen 202610120002_varsler_overforing.sql er kjørt og Edge-funksjonen send-digest er publisert
-- (se «Før neste prompt (etter prompt 8 og 11)» i docs/PROMPTPLAN.md).
--
-- Bytt ut HEMMELIGHET med samme verdi som CRON_SECRET i Edge Function Secrets (minst 24 tegn, f.eks. fra
-- `openssl rand -hex 32`). Hemmeligheten lagres kryptert i Vault og skal aldri inn i repoet.
-- Sammendraget sendes kl. 14.00 UTC (16.00 norsk sommertid, 15.00 vintertid).

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

select vault.create_secret('HEMMELIGHET','send_digest_secret','Delt hemmelighet mellom pg_cron og Edge-funksjonen send-digest');

select cron.schedule('elevradsnett-epostsammendrag','0 14 * * *',$$
  select net.http_post(
    url:='https://ibipqyombdmtfvgthugz.supabase.co/functions/v1/send-digest',
    headers:=jsonb_build_object('Content-Type','application/json',
      'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='send_digest_secret')),
    body:='{}'::jsonb,
    timeout_milliseconds:=60000);
$$);

-- Kontroll: skal gi to rader, de nattlige jobbene fra migrasjonen og e-postsammendraget.
select jobname,schedule,active from cron.job where jobname like 'elevradsnett-%' order by jobname;
