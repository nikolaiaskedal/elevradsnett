import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { formatEventSpan, formatRelative } from '@/lib/domain/time';
import { SupabaseElevradsnettService, toNorwegianError } from '@/lib/services/supabase-service';

/** Minimal falsk Supabase-klient: svarer på RPC-er fra en tabell og registrerer kallene. */
function fakeClient(rpcs:Record<string,unknown>, userId:string|null = 'u1') {
  const calls:{ name:string; args:unknown }[] = [];
  const auth = {
    getSession:async()=>({ data:{ session:userId?{ user:{ id:userId } }:null } }),
    signInWithOtp:vi.fn(async()=>({ error:null })),
    verifyOtp:vi.fn(async()=>({ error:{ message:'Token has expired or is invalid', status:403 } })),
  };
  const client = {
    auth,
    rpc:async(name:string,args?:unknown)=>{ calls.push({ name,args }); const value = rpcs[name]; return value instanceof Error ? { data:null, error:{ message:value.message } } : { data:value ?? null, error:null }; },
    storage:{ from:()=>({ getPublicUrl:(path:string)=>({ data:{ publicUrl:`https://cdn.test/${path}` } }) }) },
  };
  return { client:client as unknown as SupabaseClient, calls, auth };
}

describe('SupabaseElevradsnettService: økt',()=>{
  it('er anonym uten innlogging, uten å spørre databasen',async()=>{
    const { client,calls } = fakeClient({},null);
    expect(await new SupabaseElevradsnettService(client).getSession()).toEqual({ status:'anonymous' });
    expect(calls).toEqual([]);
  });
  it('sender innloggede uten profil til onboarding',async()=>{
    const { client } = fakeClient({ get_my_session:{ status:'onboarding', email:'ny@example.invalid' } });
    expect(await new SupabaseElevradsnettService(client).getSession()).toEqual({ status:'onboarding', email:'ny@example.invalid' });
  });
  it('bruker publiseringsretten serveren har regnet ut, og velger aktiv representasjon',async()=>{
    const { client } = fakeClient({ get_my_session:{
      status:'active', active_membership_id:'m2',
      profile:{ id:'u1', display_name:'Ida Halvorsen', email:'ida@example.invalid', avatar_path:'u1/a.webp', current_school_id:'s1' },
      representations:[
        { id:'m1', organization_id:'s1', name:'Elvebakken vgs', type:'school', public_title:'Elevrådsleder', can_publish:true },
        { id:'m2', organization_id:'c1', name:'Elevorganisasjonen i Oslo', type:'county_board', public_title:'', can_publish:false },
      ] } });
    const session = await new SupabaseElevradsnettService(client).getSession();
    expect(session).toMatchObject({ status:'active', activeRepresentationId:'m2',
      user:{ id:'u1', name:'Ida Halvorsen', initials:'IH', schoolId:'s1', avatarUrl:'https://cdn.test/u1/a.webp' } });
    if (session.status!=='active') throw new Error();
    expect(session.representations.map(r=>[r.id,r.canPublish,r.publicRole])).toEqual([['m1',true,'Elevrådsleder'],['m2',false,'Medlem']]);
  });
});

describe('SupabaseElevradsnettService: innlogging',()=>{
  it('ber om kode med normalisert e-post og lar Supabase opprette nye kontoer',async()=>{
    const { client,auth } = fakeClient({});
    await new SupabaseElevradsnettService(client).requestLoginCode({ email:' Ida@Example.INVALID ' });
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ email:'ida@example.invalid', options:{ shouldCreateUser:true } });
  });
  it('gir norsk feilmelding for feil kode',async()=>{
    const { client } = fakeClient({});
    await expect(new SupabaseElevradsnettService(client).verifyLoginCode({ email:'ida@example.invalid', code:'123456' })).rejects.toThrow('Koden er feil eller utløpt');
  });
});

describe('SupabaseElevradsnettService: offentlig lesing',()=>{
  it('lager innleggskort uten å telle egen støtte to ganger',async()=>{
    const { client,calls } = fakeClient({ get_post_cards:[{
      id:'p1', organization_id:'s1', organization_name:'Elvebakken vgs', actor_name:'Ida Halvorsen', actor_title:'Elevrådsleder', body:'Hei', audience:'public',
      priority:false, edited:true, published_at:new Date().toISOString(), support_count:3, comment_count:1, supported:true,
      comments:[{ id:'c1', organization_id:'s2', organization_name:'Kuben vgs', created_at:new Date().toISOString(), body:'Bra!' }],
      poll:{ question:'Ja?', closes_at:null, results_visibility:'always', options:[{ id:'o1', label:'Ja', votes:2 }] } }] });
    const [post] = await new SupabaseElevradsnettService(client).listFeed({ representationId:null, mode:'chronological' });
    expect(calls[0]).toEqual({ name:'get_post_cards', args:{ p_representation_id:undefined, p_mode:'chronological' } });
    expect(post).toMatchObject({ id:'p1', initials:'EV', actorName:'Ida Halvorsen', actorRole:'Elevrådsleder', edited:true, likes:2, supported:true, comments:1, createdAt:'nå' });
    expect(post.commentItems?.[0]).toMatchObject({ organizationName:'Kuben vgs', body:'Bra!' });
    expect(post.poll).toMatchObject({ question:'Ja?', closesAt:'ingen frist', options:[{ id:'o1', votes:2 }] });
  });
  it('henter organisasjoner med tall fra serveren',async()=>{
    const { client } = fakeClient({ list_public_organizations:[{ id:'s1', type:'school', name:'Elvebakken videregående skole', school_name:'Elvebakken videregående skole', slug:'elvebakken',
      county:'Oslo', local_board_id:null, local_board_name:'Oslo Sentrum lokallag', school_level:'upper_secondary', status:'active', bio:null, contact_email:null,
      student_count:1200, member_count:null, follower_count:4, following:false, officer_count:2, priorities_heading:null, priorities:null }] });
    const [o] = await new SupabaseElevradsnettService(client).listOrganizations();
    expect(o).toMatchObject({ id:'s1', initials:'EV', localBoard:'Oslo Sentrum lokallag', followers:4, officerCount:2, bio:'' });
  });
});

describe('toNorwegianError',()=>{
  it('oversetter kjente feil fra databasen og Auth',()=>{
    expect(toNorwegianError({ message:'last school administrator' }).message).toContain('siste skoleadministrator');
    expect(toNorwegianError({ message:'email rate limit exceeded', status:429 }).message).toBe('For mange forsøk. Vent litt og prøv igjen.');
    expect(toNorwegianError({ message:'something internal' },'Kunne ikke lagre.').message).toBe('Kunne ikke lagre.');
  });
});

describe('tidsformatering',()=>{
  it('viser relativ tid på norsk',()=>{
    const now = new Date('2026-10-01T12:00:00Z');
    expect(formatRelative('2026-10-01T11:59:40Z',now)).toBe('nå');
    expect(formatRelative('2026-10-01T11:45:00Z',now)).toBe('for 15 min siden');
    expect(formatRelative('2026-10-01T09:00:00Z',now)).toBe('for 3 t siden');
    expect(formatRelative('2026-09-30T09:00:00Z',now)).toBe('i går');
    expect(formatRelative('2026-09-12T09:00:00Z',now)).toBe('12. september');
    expect(formatRelative('2025-09-12T09:00:00Z',now)).toBe('12. september 2025');
  });
  it('viser arrangementer på én eller flere dager i norsk tid',()=>{
    expect(formatEventSpan('2026-09-24T15:00:00Z','2026-09-24T18:00:00Z')).toEqual({ start:'24. september 2026', end:'kl. 17–20' });
    expect(formatEventSpan('2026-10-11T10:00:00Z','2026-10-12T14:00:00Z')).toEqual({ start:'11.–12. oktober 2026', end:'' });
  });
});
