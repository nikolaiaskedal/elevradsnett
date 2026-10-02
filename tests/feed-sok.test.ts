import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it } from 'vitest';
import { DemoElevradsnettService } from '@/lib/services/demo-service';
import { SupabaseElevradsnettService } from '@/lib/services/supabase-service';

let service:DemoElevradsnettService;
beforeEach(()=>{ service = new DemoElevradsnettService(); });

describe('Demo: feed',()=>{
  it('rangerer anbefalt feed annerledes enn kronologisk, med de samme innleggene',async()=>{
    const recommended = await service.listFeed({ representationId:null, mode:'recommended' });
    const chronological = await service.listFeed({ representationId:null, mode:'chronological' });
    expect(recommended.map(p=>p.id).sort()).toEqual(chronological.map(p=>p.id).sort());
    // Prioriterte innlegg fra EO kommer først i anbefalt feed.
    expect(recommended[0].priority).toBe(true);
  });
  it('løfter innlegg fra organisasjoner brukeren følger',async()=>{
    const before = await service.listFeed({ representationId:null, mode:'recommended' });
    const last = before.at(-1)!;
    await service.setFollow({ organizationId:last.organizationId, following:true });
    const after = await service.listFeed({ representationId:null, mode:'recommended' });
    expect(after.findIndex(p=>p.id===last.id)).toBeLessThan(before.length-1);
  });
  it('gir offentlige innlegg til utloggede',async()=>{
    const anon = new DemoElevradsnettService({ signedIn:false });
    expect((await anon.listFeed({ representationId:null, mode:'recommended' })).every(p=>p.audience==='public')).toBe(true);
  });
});

describe('Demo: søk',()=>{
  it('krever minst to tegn',async()=>{
    expect(await service.search({ query:'e' })).toEqual([]);
  });
  it('finner skoler, personer og innlegg, og filtrerer på type',async()=>{
    expect((await service.search({ query:'elveb' })).some(r=>r.kind==='school' && r.id==='elvebakken')).toBe(true);
    expect((await service.search({ query:'sivert' })).some(r=>r.kind==='person' && r.active)).toBe(true);
    const posts = await service.search({ query:'fraværsgrensa', kinds:['post'] });
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every(r=>r.kind==='post')).toBe(true);
  });
  it('viser tidligere tillitsvalgte og deaktiverte skoler bare med filteret',async()=>{
    expect((await service.search({ query:'jonas berg' })).length).toBe(0);
    expect((await service.search({ query:'jonas berg', includeFormer:true })).some(r=>r.kind==='person' && !r.active && r.subtitle?.startsWith('Tidligere:'))).toBe(true);
    expect((await service.search({ query:'fagerborg' })).some(r=>r.id==='fagerborg')).toBe(false);
    expect((await service.search({ query:'fagerborg', includeFormer:true })).some(r=>r.id==='fagerborg' && !r.active)).toBe(true);
  });
});

describe('Supabase: søk',()=>{
  it('kaller search_directory og gjør om treffene',async()=>{
    const calls:{ name:string; args:unknown }[] = [];
    const client = {
      auth:{ getSession:async()=>({ data:{ session:null } }) },
      rpc:async(name:string,args?:unknown)=>{ calls.push({ name,args }); return { data:[{ kind:'person', id:'p1', title:'Ida', subtitle:'Tidligere: Leder, Skolen', organization_id:null, active:false, starts_at:null, rank:0.5 }], error:null }; },
    };
    const results = await new SupabaseElevradsnettService(client as unknown as SupabaseClient).search({ query:'  ida  ', includeFormer:true });
    expect(calls[0]).toEqual({ name:'search_directory', args:{ p_query:'ida', p_kinds:undefined, p_include_former:true, p_limit:40 } });
    expect(results).toEqual([{ kind:'person', id:'p1', title:'Ida', subtitle:'Tidligere: Leder, Skolen', organizationId:undefined, active:false, startsAt:undefined }]);
  });
  it('spør ikke serveren for korte søk',async()=>{
    const client = { auth:{ getSession:async()=>({ data:{ session:null } }) }, rpc:async()=>{ throw new Error('skal ikke kalles'); } };
    expect(await new SupabaseElevradsnettService(client as unknown as SupabaseClient).search({ query:'a' })).toEqual([]);
  });
});
