import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
import { COUNTIES } from '@/lib/domain/counties';
import { countySchema } from '@/lib/domain/validation';

const read = (file:string) => readFileSync(new URL(`../supabase/pilot/${file}`, import.meta.url), 'utf8');

// Enkel CSV-leser som tåler felt i anførselstegn med komma.
function parseCsv(text:string) {
  const rows = text.trim().split('\n').map(line => line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.slice(0, -1).map(f => f.replace(/,$/, '').replace(/^"|"$/g, '').replaceAll('""', '"')));
  const [header, ...data] = rows;
  return data.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const schools = parseCsv(read('skoler.csv'));
const seed = read('seed.sql');

describe('pilotdata',()=>{
  it('har alle de 15 fylkene og bare dem',()=>{
    expect(new Set(schools.map(s=>s.fylke))).toEqual(new Set(COUNTIES));
    for (const school of schools) expect(countySchema.safeParse(school.fylke).success).toBe(true);
  });

  it('har gyldige og unike skoler',()=>{
    expect(schools.length).toBe(471);
    expect(new Set(schools.map(s=>s.ekstern_id)).size).toBe(schools.length);
    expect(new Set(schools.map(s=>s.slug)).size).toBe(schools.length);
    for (const school of schools) {
      expect(school.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(school.ekstern_id).toBe(`eo-skole-${school.slug}`);
      expect(['videregående','ungdomsskole']).toContain(school.skoleform);
      expect(school.status).toBe('aktiv');
    }
  });

  it('seed.sql er generert fra gjeldende CSV',()=>{
    for (const school of schools) expect(seed).toContain(`('${school.ekstern_id}',`);
    expect(seed.match(/\('eo-skole-/g)).toHaveLength(schools.length);
    expect(seed.match(/\('eo-fylke-/g)).toHaveLength(COUNTIES.length);
  });
});
