// Lager supabase/pilot/seed.sql fra supabase/pilot/skoler.csv: ett fylkesstyre per fylke og én organisasjon per skole.
// Kjør med `npm run pilot:seed` etter at CSV-en er endret.
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../supabase/pilot/', import.meta.url);
const LEVELS = { 'videregående':'upper_secondary', 'ungdomsskole':'lower_secondary' };
const STATUSES = { aktiv:'active', deaktivert:'deactivated' };

function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...data] = rows;
  return data.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const sql = v => v === '' || v == null ? 'null' : `'${String(v).replaceAll("'", "''")}'`;
const slugify = s => s.toLowerCase().replaceAll('æ','ae').replaceAll('ø','o').replaceAll('å','a').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

const schools = parseCsv(readFileSync(new URL('skoler.csv', root), 'utf8'));
const counties = [...new Set(schools.map(s => s.fylke))].sort((a, b) => a.localeCompare(b, 'nb'));

const countyRows = counties.map(c => `  (${sql(`eo-fylke-${slugify(c)}`)},${sql(`Elevorganisasjonen i ${c}`)},${sql(`fylke-${slugify(c)}`)},${sql(c)})`);
const schoolRows = schools.map(s => {
  const level = LEVELS[s.skoleform]; const status = STATUSES[s.status];
  if (!level) throw new Error(`Ukjent skoleform «${s.skoleform}» for ${s.skolenavn}`);
  if (!status) throw new Error(`Ukjent status «${s.status}» for ${s.skolenavn}`);
  return `  (${[s.ekstern_id, s.skolenavn, s.slug, s.organisasjonsnummer, s.fylke, s.lokallag, level, s.kontakt_epost, status].map(sql).join(',')})`;
});

const out = `-- PILOTDATA. Generert av scripts/build-pilot-seed.mjs fra supabase/pilot/skoler.csv. Ikke rediger for hånd.
-- ${counties.length} fylkesstyrer og ${schools.length} medlemsskoler fra Elevorganisasjonens medlemsregister 2025/2026.
-- Oppdaterer etter ekstern ID, så filen kan kjøres flere ganger.

insert into public.organizations(type,external_id,name,slug,county,status,is_placeholder)
select 'county_board',v.external_id,v.name,v.slug,v.county,'active',false
from (values
${countyRows.join(',\n')}
) as v(external_id,name,slug,county)
on conflict(external_id) do update set name=excluded.name,slug=excluded.slug,county=excluded.county;

insert into public.organizations(type,external_id,name,school_name,slug,organization_number,county,local_board_id,school_level,contact_email,status,is_placeholder)
select 'school',v.external_id,v.name,v.name,v.slug,v.organization_number,v.county,lb.id,v.school_level,v.contact_email,v.status::public.organization_status,false
from (values
${schoolRows.join(',\n')}
) as v(external_id,name,slug,organization_number,county,local_board,school_level,contact_email,status)
left join public.organizations lb on lb.type='local_board' and lb.slug=v.local_board
on conflict(external_id) do update set name=excluded.name,school_name=excluded.school_name,slug=excluded.slug,
  organization_number=excluded.organization_number,county=excluded.county,local_board_id=excluded.local_board_id,
  school_level=excluded.school_level,contact_email=excluded.contact_email,status=excluded.status;

-- Fylkesstyret inneholder skolene i fylket.
insert into public.organization_relations(parent_id,child_id,relation_type)
select f.id,s.id,'county_contains'
from public.organizations s
join public.organizations f on f.type='county_board' and f.county=s.county and f.external_id like 'eo-fylke-%'
where s.type='school' and s.external_id like 'eo-skole-%'
on conflict(parent_id,child_id,relation_type) do nothing;
`;
writeFileSync(new URL('seed.sql', root), out);
console.log(`Skrev supabase/pilot/seed.sql: ${counties.length} fylker, ${schools.length} skoler.`);
