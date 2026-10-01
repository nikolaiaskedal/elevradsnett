/** Feilmeldinger fra meldings-RPC-ene (supabase/migrations/202610100001_meldinger.sql), oversatt til norsk. */
export const messagingServerMessages:Record<string,string> = {
  'conversation not found':'Fant ikke samtalen, eller du er ikke lenger med i den.',
  'message not found':'Fant ikke meldingen.',
  'blocked':'Du kan ikke sende meldinger til denne personen.',
  'empty message':'Meldingen er tom.',
  'message too long':'Meldingen er for lang.',
  'invalid attachment':'Vedlegget kunne ikke sendes. Prøv igjen, eller velg en annen fil.',
  'rate limited':'Du sender for mye på kort tid. Vent litt og prøv igjen.',
  'invalid group name':'Gi gruppen et navn på maks 80 tegn.',
  'no members':'Fant ingen personer å legge til.',
  'too many members':'En gruppe kan ha maks 100 medlemmer.',
  'cannot leave':'Du kan ikke forlate denne gruppen. Den følger vervene dine.',
  'cannot report own message':'Du kan ikke rapportere din egen melding.',
  'invalid category':'Velg hva rapporten gjelder.',
  'invalid description':'Beskrivelsen er for lang.',
  'already reported':'Du har allerede rapportert denne meldingen.',
};
