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

describe('SupabaseElevradsnettService: verv og rettigheter',()=>{
  it('viser verv i deaktiverte organisasjoner, men velger dem aldri som aktive',async()=>{
    const { client } = fakeClient({ get_my_session:{
      status:'active', active_membership_id:'m1',
      profile:{ id:'u1', display_name:'Ida Halvorsen', email:'ida@example.invalid', avatar_path:null, current_school_id:'s1' },
      representations:[
        { id:'m2', organization_id:'c1', name:'Elevorganisasjonen i Oslo', type:'county_board', organization_status:'active', public_title:'Fylkesleder', can_publish:true },
        { id:'m1', organization_id:'s0', name:'Nedlagt skole', type:'school', organization_status:'deactivated', public_title:'Leder', can_publish:false },
      ] } });
    const session = await new SupabaseElevradsnettService(client).getSession();
    if (session.status!=='active') throw new Error();
    expect(session.activeRepresentationId).toBe('m2');
    expect(session.representations.map(r=>r.organizationStatus)).toEqual(['active','deactivated']);
  });
  it('sender rettigheter og verv til RPC-ene og viser serverens svar',async()=>{
    const { client,calls } = fakeClient({
      list_my_admin_organizations:[{ id:'s1', type:'school', name:'Elvebakken vgs', school_name:'Elvebakken videregående skole', county:'Oslo', status:'active', my_role:'school_admin', grantable_roles:['school_admin','content_manager'] }],
      list_organization_roles:[{ kind:'role', id:'g1', user_id:'u2', display_name:'Sivert Aune', user_active:false, title:null, role:'content_manager', start_date:'2026-09-01', end_date:null, status:'active', granted_by_name:'Ida Halvorsen', granted_at:'2026-09-01T10:00:00Z', can_change:true }],
    });
    const service = new SupabaseElevradsnettService(client);
    expect(await service.listAdminOrganizations()).toEqual([{ id:'s1', type:'school', name:'Elvebakken videregående skole', county:'Oslo', status:'active', myRole:'school_admin', grantableRoles:['school_admin','content_manager'] }]);
    expect((await service.listOrganizationRoles('s1'))[0]).toMatchObject({ kind:'role', role:'content_manager', userName:'Sivert Aune', userActive:false, title:'', endDate:null, canChange:true });
    await service.assignPublicOffice({ organizationId:'s1', userId:'u2', title:' Nestleder ' });
    await service.assignRole({ organizationId:'s1', userId:'u2', role:'content_manager' });
    await service.revokeRole('g1');
    expect(calls.slice(-3).map(c=>c.name)).toEqual(['assign_public_office','assign_role','revoke_role']);
    expect(calls.at(-3)?.args).toEqual({ p_user:'u2', p_org:'s1', p_title:'Nestleder' });
    expect(calls.at(-2)?.args).toMatchObject({ p_user:'u2', p_org:'s1', p_role:'content_manager', p_starts:expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    await expect(service.assignRole({ organizationId:'s1', userId:'u2', role:'eier' as never })).rejects.toThrow('Ukjent rettighet');
  });
});

describe('toNorwegianError',()=>{
  it('oversetter kjente feil fra databasen og Auth',()=>{
    expect(toNorwegianError({ message:'last school administrator' }).message).toContain('siste skoleadministrator');
    expect(toNorwegianError({ message:'last administrator' }).message).toContain('minst én administrator');
    expect(toNorwegianError({ message:'self escalation is not allowed' }).message).toBe('Du kan ikke gi deg selv rettigheter.');
    expect(toNorwegianError({ message:'duplicate key value violates unique constraint "x"' }).message).toBe('Dette er allerede registrert.');
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
