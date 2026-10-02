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
    rpc:async(name:string,args?:unknown)=>{ calls.push({ name,args }); const value = rpcs[name]; return value instanceof Error ? { data:null, error:{ message:value.message, code:(value as Error & { code?:string }).code } } : { data:value ?? null, error:null }; },
    storage:{ from:(bucket:string)=>({
      getPublicUrl:(path:string)=>({ data:{ publicUrl:`https://cdn.test/${path}` } }),
      upload:async(path:string)=>{ calls.push({ name:'storage.upload', args:{ bucket,path } }); return { data:{ path }, error:null }; },
      remove:async(paths:string[])=>{ calls.push({ name:'storage.remove', args:{ bucket,paths } }); return { data:[], error:null }; },
    }) },
    // process-media svarer «ready», med mindre testen har lagt inn et avslag.
    functions:{ invoke:async(name:string,options:{ body:{ action:string } })=>{
      calls.push({ name:`function.${name}`, args:options.body });
      const rejection = rpcs['process-media'] as string|undefined;
      if (options.body.action==='check' && rejection) return { data:null, error:{ context:new Response(JSON.stringify({ status:'failed', reason:rejection }),{ status:422 }) } };
      return { data:{ status:'ready' }, error:null };
    } },
    // Representasjonen s1-m1 gjelder organisasjonen s1 (memberships leses med RLS).
    from:()=>({ select:()=>({ eq:()=>({ single:async()=>({ data:{ organization_id:'s1' }, error:null }) }) }) }),
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
    const { client,calls } = fakeClient({ list_posts:[{
      id:'p1', organization_id:'s1', organization_name:'Elvebakken vgs', actor_name:'Ida Halvorsen', actor_title:'Elevrådsleder', body:'Hei', audience:'public',
      school_level:'upper_secondary', event_id:'e1', can_manage:true, priority:false, edited:true, published_at:new Date().toISOString(), support_count:3, comment_count:1, supported:true,
      comments:[{ id:'c1', organization_id:'s2', organization_name:'Kuben vgs', created_at:new Date().toISOString(), body:'Bra!' }],
      poll:{ id:'pl1', question:'Ja?', closes_at:null, closed:false, my_vote:'o1', show_results:true, total:2, results_visibility:'after_vote', options:[{ id:'o1', label:'Ja', votes:2 }] },
      media:[{ id:'m1', path:'s1/posts/p1/a.webp', alt:'Stand', status:'ready', width:800, height:600 }] }] });
    const [post] = await new SupabaseElevradsnettService(client).listFeed({ representationId:null, mode:'chronological' });
    expect(calls[0]).toEqual({ name:'list_posts', args:{ p_representation_id:undefined, p_mode:'chronological' } });
    expect(post).toMatchObject({ id:'p1', initials:'EV', actorName:'Ida Halvorsen', actorRole:'Elevrådsleder', edited:true, likes:2, supported:true, comments:1, createdAt:'nå',
      schoolLevel:'upper_secondary', eventId:'e1', canManage:true });
    expect(post.commentItems?.[0]).toMatchObject({ organizationName:'Kuben vgs', body:'Bra!' });
    expect(post.poll).toMatchObject({ id:'pl1', question:'Ja?', closesAt:'ingen frist', closed:false, myVote:'o1', showResults:true, totalVotes:2, options:[{ id:'o1', votes:2 }] });
    expect(post.media).toEqual([{ id:'m1', type:'image', alt:'Stand', status:'ready', url:'https://cdn.test/s1/posts/p1/a.webp', width:800, height:600 }]);
  });
  it('henter organisasjoner med tall fra serveren',async()=>{
    const { client } = fakeClient({ list_public_organizations:[{ id:'s1', type:'school', name:'Elvebakken videregående skole', school_name:'Elvebakken videregående skole', slug:'elvebakken',
      county:'Oslo', local_board_id:null, local_board_name:'Oslo Sentrum lokallag', school_level:'upper_secondary', status:'active', bio:null, contact_email:null,
      student_count:1200, member_count:null, follower_count:4, following:false, officer_count:2, priorities_heading:null, priorities:null }] });
    const [o] = await new SupabaseElevradsnettService(client).listOrganizations();
    expect(o).toMatchObject({ id:'s1', initials:'EV', localBoard:'Oslo Sentrum lokallag', followers:4, officerCount:2, bio:'' });
  });
});

const card = { id:'p9', organization_id:'s1', organization_name:'Elvebakken vgs', actor_name:'Ida', actor_title:'Leder', body:'Hei alle', audience:'county',
  school_level:'both', event_id:null, can_manage:true, priority:false, edited:false, published_at:new Date().toISOString(), support_count:0, comment_count:0,
  supported:false, comments:[], poll:null, media:[] };
const draftRow = { id:'d1', organization_id:'s1', body:'Utkast', audience:'public', school_level:'both', event_id:null, updated_at:new Date().toISOString(), actor_name:'Ida' };

describe('SupabaseElevradsnettService: innlegg',()=>{
  it('publiserer renset tekst med målgruppe, skoleform og arrangement, og viser kortet fra serveren',async()=>{
    const { client,calls } = fakeClient({ create_post:{ id:'p9', organization_id:'s1' }, list_posts:[card] });
    const post = await new SupabaseElevradsnettService(client).publishPost({ representationId:'s1-m1', body:' <b>Hei</b> alle ', audience:'county', eventId:'e1' });
    expect(calls[0]).toEqual({ name:'create_post', args:{ p_organization:'s1', p_body:'Hei alle', p_audience:'county', p_school_level:'both', p_event:'e1', p_publish:true } });
    expect(post).toMatchObject({ id:'p9', body:'Hei alle', canManage:true });
  });
  it('lagrer innlegg med avstemning og bilde som utkast, kontrollerer bildet og publiserer til slutt',async()=>{
    const { client,calls } = fakeClient({ create_post:{ id:'p9', organization_id:'s1' }, update_post:{ id:'p9', organization_id:'s1' }, add_post_poll:'pl1', add_post_media:'m1', list_posts:[card] });
    const steps:string[] = [];
    const image = new Blob([new Uint8Array([1,2,3])],{ type:'image/webp' });
    await new SupabaseElevradsnettService(client).publishPost({ representationId:'s1-m1', body:'Hva mener dere?', audience:'public',
      poll:{ question:' Hvilken sak? ', options:['Ja','','Nei'] }, images:[{ file:image, alt:'Stand i kantina' }] }, p=>steps.push(p.step));
    expect(calls.map(c=>c.name)).toEqual(['create_post','add_post_poll','storage.upload','add_post_media','function.process-media','update_post','list_posts']);
    expect(calls[0]).toMatchObject({ args:{ p_publish:false } });
    expect(calls[1]).toMatchObject({ args:{ p_post:'p9', p_question:'Hvilken sak?', p_options:['Ja','Nei'], p_closes_at:null } });
    expect((calls[2].args as { path:string }).path).toMatch(/^s1\/posts\/p9\/[0-9a-f-]+\.webp$/);
    expect(calls[3]).toMatchObject({ args:{ p_post:'p9', p_alt:'Stand i kantina' } });
    expect(calls[4]).toMatchObject({ args:{ action:'check', bucket:'public-content' } });
    expect(calls[5]).toMatchObject({ args:{ p_post:'p9', p_publish:true } });
    expect(steps).toEqual(['saving','uploading','checking','publishing']);
  });
  it('sletter det nye utkastet når serveren avviser bildet',async()=>{
    const { client,calls } = fakeClient({ create_post:{ id:'p9', organization_id:'s1' }, add_post_media:'m1', 'process-media':'has_metadata' });
    const image = new Blob([new Uint8Array([1])],{ type:'image/jpeg' });
    await expect(new SupabaseElevradsnettService(client).publishPost({ representationId:'s1-m1', body:'Bilde', audience:'public', images:[{ file:image, alt:'' }] }))
      .rejects.toThrow('metadata');
    expect(calls.some(c=>c.name==='update_post')).toBe(false);
    expect(calls).toContainEqual({ name:'delete_post', args:{ p_post:'p9' } });
  });
  it('avviser bilder som ikke er omkodet til WebP eller JPEG, og for mange bilder',async()=>{
    const { client } = fakeClient({});
    const service = new SupabaseElevradsnettService(client);
    const gif = new Blob([new Uint8Array([1])],{ type:'image/gif' });
    await expect(service.publishPost({ representationId:'s1-m1', body:'Bilde', audience:'public', images:[{ file:gif, alt:'' }] })).rejects.toThrow('WebP eller JPEG');
    const webp = { file:new Blob([new Uint8Array([1])],{ type:'image/webp' }), alt:'' };
    await expect(service.publishPost({ representationId:'s1-m1', body:'Bilde', audience:'public', images:[webp,webp,webp,webp,webp] })).rejects.toThrow('maks 4 bilder');
  });
  it('gir og fjerner støtte, følger og rapporterer via RPC-er',async()=>{
    const { client,calls } = fakeClient({ set_post_support:4, set_follow:12, report_post:'r1' });
    const service = new SupabaseElevradsnettService(client);
    expect(await service.setPostSupport({ postId:'p1', supported:true })).toBe(4);
    expect(await service.setFollow({ organizationId:'s2', following:true })).toBe(12);
    await service.reportPost({ postId:'p1', category:'spam' });
    expect(calls).toEqual([
      { name:'set_post_support', args:{ p_post:'p1', p_supported:true } },
      { name:'set_follow', args:{ p_org:'s2', p_following:true } },
      { name:'report_post', args:{ p_post:'p1', p_category:'spam', p_description:null } },
    ]);
  });
  it('henter organisasjonsbilder med kilde fra hierarkiet',async()=>{
    const { client } = fakeClient({ get_organization_images:[{ profile_image_path:null, profile_image_source:'none', cover_image_path:'c1/cover/a.webp', cover_image_source:'county', locked:false, can_change:true }] });
    expect(await new SupabaseElevradsnettService(client).getOrganizationImages('s1')).toEqual({ profileUrl:undefined, profileSource:'none',
      coverUrl:'https://cdn.test/c1/cover/a.webp', coverSource:'county', locked:false, canChange:true });
  });
  it('publiserer et utkast via update_post',async()=>{
    const { client,calls } = fakeClient({ update_post:{ id:'p9', organization_id:'s1' }, list_posts:[card] });
    await new SupabaseElevradsnettService(client).publishPost({ representationId:'s1-m1', draftId:'p9', body:'Hei alle', audience:'county' });
    expect(calls[0]).toMatchObject({ name:'update_post', args:{ p_post:'p9', p_publish:true } });
  });
  it('lagrer og lister utkast',async()=>{
    const { client,calls } = fakeClient({ create_post:{ id:'d1', organization_id:'s1' }, list_post_drafts:[draftRow] });
    const service = new SupabaseElevradsnettService(client);
    expect(await service.saveDraft({ representationId:'s1-m1', body:'Utkast', audience:'public' })).toMatchObject({ id:'d1', body:'Utkast', schoolLevel:'both', actorName:'Ida' });
    expect(calls[0]).toMatchObject({ name:'create_post', args:{ p_publish:false } });
    expect(await service.listDrafts('s1-m1')).toHaveLength(1);
  });
  it('redigerer, sletter og henter historikk',async()=>{
    const { client,calls } = fakeClient({ update_post:{ id:'p9', organization_id:'s1' }, list_posts:[{ ...card, edited:true }],
      get_post_history:[{ id:'r1', body:'Før', audience:'public', school_level:'both', edited_by_name:'Ida', created_at:'2026-10-01T10:00:00Z' }] });
    const service = new SupabaseElevradsnettService(client);
    expect(await service.editPost({ postId:'p9', body:'Etter', audience:'public' })).toMatchObject({ edited:true });
    expect(calls[0]).toMatchObject({ name:'update_post', args:{ p_post:'p9', p_body:'Etter' } });
    expect(await service.listPostHistory('p9')).toEqual([{ id:'r1', body:'Før', audience:'public', schoolLevel:'both', editedByName:'Ida', createdAt:'2026-10-01T10:00:00Z' }]);
    await service.deletePost('p9');
    expect(calls.at(-2)).toEqual({ name:'delete_post', args:{ p_post:'p9' } });
    // Bildene til innlegget slettes av serveren (storage_deletions).
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(calls.at(-1)).toEqual({ name:'function.process-media', args:{ action:'cleanup' } });
  });
  it('oversetter feil om målgruppe og arrangement',async()=>{
    const { client } = fakeClient({ create_post:new Error('invalid audience') });
    await expect(new SupabaseElevradsnettService(client).publishPost({ representationId:'s1-m1', body:'Hei', audience:'friends' })).rejects.toThrow('målgruppen passer ikke');
  });
});

describe('SupabaseElevradsnettService: venneråd',()=>{
  it('lister, ber om, svarer på og avslutter venneråd',async()=>{
    const { client,calls } = fakeClient({ list_friend_connections:[{ id:'fc1', school_id:'s2', school_name:'Kuben vgs', county:'Oslo', status:'pending', direction:'incoming',
      created_at:'2026-09-30T10:00:00Z', approved_at:null, can_decide:true }] });
    const service = new SupabaseElevradsnettService(client);
    expect(await service.listFriendConnections('s1')).toEqual([{ id:'fc1', schoolId:'s2', schoolName:'Kuben vgs', county:'Oslo', status:'pending', direction:'incoming',
      createdAt:'2026-09-30T10:00:00Z', approvedAt:undefined, canDecide:true }]);
    await service.requestFriendSchool({ schoolId:'s1', targetSchoolId:'s3' });
    await service.decideFriendRequest({ connectionId:'fc1', accept:true });
    await service.endFriendConnection('fc1');
    expect(calls.slice(1)).toEqual([
      { name:'request_friend_school', args:{ p_school:'s1', p_target:'s3' } },
      { name:'decide_friend_request', args:{ p_connection:'fc1', p_accept:true } },
      { name:'end_friend_connection', args:{ p_connection:'fc1' } },
    ]);
    await expect(service.requestFriendSchool({ schoolId:'s1', targetSchoolId:' ' })).rejects.toThrow('Velg en skole');
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

describe('SupabaseElevradsnettService: arrangementer og CV',()=>{
  const row = { id:'e1', organizer_id:'c1', organizer_name:'Elevorganisasjonen i Oslo', title:'Fylkessamling', summary:null, description:'To dager.', category:'samling',
    starts_at:'2026-10-11T10:00:00Z', ends_at:'2026-10-12T14:00:00Z', place:null, digital:true, digital_url:null, registration_deadline:'2026-10-01T21:59:00Z',
    capacity:80, price_label:null, seats_per_organization:2, status:'published', audience:'county', image_path:'c1/events/e1/a.webp',
    registered:3, interested:5, interested_by_me:true, can_edit:false };
  it('viser arrangementer med bilde, målgruppe og egen interesse fra serveren',async()=>{
    const { client,calls } = fakeClient({ list_events:[row] });
    const [event] = await new SupabaseElevradsnettService(client).listEvents();
    expect(calls[0].name).toBe('list_events');
    expect(event).toMatchObject({ id:'e1', hostId:'c1', start:'11.–12. oktober 2026', place:'Digitalt (lenke)', digitalUrl:undefined, deadline:'1. oktober',
      deadlineAt:'2026-10-01T21:59:00Z', audience:'Elevråd i fylket', audienceCode:'county', interestedByMe:true, canEdit:false, imageUrl:'https://cdn.test/c1/events/e1/a.webp' });
  });
  it('faller tilbake til list_public_events før migrasjonen er kjørt',async()=>{
    const missing = Object.assign(new Error('Could not find the function public.list_events'),{ code:'PGRST202' });
    const { client,calls } = fakeClient({ list_events:missing, list_public_events:[{ ...row, image_path:undefined }] });
    const [event] = await new SupabaseElevradsnettService(client).listEvents();
    expect(calls.map(c=>c.name)).toEqual(['list_events','list_public_events']);
    expect(event).toMatchObject({ id:'e1', canEdit:false, interestedByMe:false, imageUrl:undefined });
  });
  it('sender tomme felt som null til save_event',async()=>{
    const { client,calls } = fakeClient({ save_event:'e2' });
    const id = await new SupabaseElevradsnettService(client).saveEvent({ organizerId:'c1', title:'Kurs', description:'Om møteledelse.', category:'kurs',
      startsAt:'2030-01-01T16:00:00.000Z', endsAt:'2030-01-01T19:00:00.000Z', location:'Oslo', digitalUrl:'', summary:' ', audience:'public', status:'draft' });
    expect(id).toBe('e2');
    expect(calls[0].args).toMatchObject({ p_event:null, p_organizer:'c1', p_summary:null, p_place:'Oslo', p_digital_url:null, p_capacity:null, p_registration_deadline:null, p_status:'draft' });
  });
  it('gjør om påmelding og CV fra serveren',async()=>{
    const { client } = fakeClient({
      get_event_participation:{ interested:false, can_edit:true,
        invitations:[{ delegate_id:'d1', registration_id:'r1', organization_id:'s1', organization_name:'Elvebakken vgs', status:'invited', office_title:null }],
        organizations:[{ organization_id:'s1', organization_name:'Elvebakken vgs', type:'school', allowed:true, registration_id:'r1', status:'registered',
          delegates:[{ id:'d1', user_id:'u1', display_name:'Ida Halvorsen', status:'invited', office_title:'Leder' }] }], attendance:[] },
      get_person_cv:{ id:'u1', display_name:'Ida Halvorsen', avatar_path:null, school_name:'Elvebakken vgs', active:true, offices:[], invitations:[],
        events:[{ event_id:'e0', title:'Elevtinget', starts_at:'2026-03-12T11:00:00Z', category:'landsmote', organizer_name:'EO', organization_id:'s1', organization_name:'Elvebakken vgs', office_title:null, elevtinget:true }] },
    });
    const service = new SupabaseElevradsnettService(client);
    const p = await service.getEventParticipation('e1');
    expect(p).toMatchObject({ canEdit:true, invitations:[{ delegateId:'d1', officeTitle:undefined }], attendance:[] });
    expect(p.organizations[0].delegates[0]).toEqual({ id:'d1', userId:'u1', name:'Ida Halvorsen', status:'invited', officeTitle:'Leder' });
    expect(await service.getPersonCv('u1')).toMatchObject({ initials:'IH', stars:1, events:[{ eventId:'e0', category:'landsmote', officeTitle:undefined }] });
  });
  it('oversetter feil fra påmeldingen',()=>{
    expect(toNorwegianError({ message:'no seats left' }).message).toBe('Organisasjonen har ingen ledige plasser.');
    expect(toNorwegianError({ message:'outside audience' }).message).toContain('målgruppen');
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
