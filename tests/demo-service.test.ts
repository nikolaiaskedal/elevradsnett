import { beforeEach, describe, expect, it } from 'vitest';
import { NotImplementedError } from '@/lib/services/contracts';
import { createService } from '@/lib/services/create-service';
import type { Session, SignedInSession } from '@/lib/domain/types';
import { DEMO_EMAIL, DEMO_LOGIN_CODE, DemoElevradsnettService } from '@/lib/services/demo-service';
import { SupabaseElevradsnettService } from '@/lib/services/supabase-service';

let service:DemoElevradsnettService;
beforeEach(()=>{ service = new DemoElevradsnettService(); });

/** Id-en til en person ved Elvebakken, slik administratoren finner den. */
async function personId(name:string, organizationId = 'elvebakken') {
  const [person] = await service.searchAssignablePeople({ organizationId, query:name });
  if (!person) throw new Error(`Fant ikke ${name}`);
  return person.id;
}

function signedIn(session:Session):SignedInSession {
  if (session.status!=='active' && session.status!=='deactivated') throw new Error(`Ikke innlogget: ${session.status}`);
  return session;
}
const inDays = (days:number)=>{ const d = new Date(); d.setDate(d.getDate()+days); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

describe('DemoElevradsnettService: lesing',()=>{
  it('gir en økt med bruker, representasjoner og aktiv representasjon',async()=>{
    const session = signedIn(await service.getSession());
    expect(session.user.name).toBe('Ida Halvorsen');
    expect(session.representations.length).toBeGreaterThan(0);
    expect(session.representations.map(r=>r.id)).toContain(session.activeRepresentationId);
  });
  it('lister organisasjoner, feed, arrangementer og samtaler',async()=>{
    const { activeRepresentationId } = signedIn(await service.getSession());
    expect((await service.listOrganizations()).length).toBeGreaterThan(0);
    expect((await service.listFeed({ representationId:activeRepresentationId, mode:'chronological' })).length).toBeGreaterThan(0);
    expect((await service.listEvents()).length).toBeGreaterThan(0);
    expect((await service.listConversations()).length).toBeGreaterThan(0);
  });
  it('lister offentlige verv for en organisasjon',async()=>{
    const officers = await service.listPublicOfficers('elvebakken');
    expect(officers[0]).toMatchObject({ name:'Ida Halvorsen', publicTitle:'Elevrådsleder' });
  });
  it('returnerer kopier, så kallere ikke kan endre tjenestens tilstand',async()=>{
    const orgs = await service.listOrganizations();
    orgs[0].name = 'Endret';
    expect((await service.listOrganizations())[0].name).not.toBe('Endret');
  });
  it('deler ikke tilstand mellom instanser',async()=>{
    await service.setFollow({ organizationId:'kuben', following:true });
    const other = new DemoElevradsnettService();
    expect((await other.listOrganizations()).find(o=>o.id==='kuben')?.following).toBeFalsy();
  });
  it('avviser ukjent representasjon i feeden',async()=>{
    await expect(service.listFeed({ representationId:'finnes-ikke', mode:'recommended' })).rejects.toThrow('Ukjent representasjon');
  });
});

describe('DemoElevradsnettService: innlegg',()=>{
  it('publiserer innlegg øverst i feeden som aktiv representasjon',async()=>{
    const post = await service.publishPost({ representationId:'rep-school', body:'  Hei fra elevrådet  ', audience:'public', status:'published' });
    expect(post).toMatchObject({ organizationId:'elvebakken', organizationName:'Elvebakken vgs elevråd', actorName:'Ida Halvorsen', body:'Hei fra elevrådet', likes:0, comments:0 });
    const feed = await service.listFeed({ representationId:'rep-school', mode:'chronological' });
    expect(feed[0].id).toBe(post.id);
  });
  it('lager avstemning og bilde når det er valgt',async()=>{
    const post = await service.publishPost({ representationId:'rep-school', body:'Hva mener dere?\nMer tekst', audience:'county', status:'published', poll:{ options:['Ja','Nei'] }, withImage:true });
    expect(post.poll?.question).toBe('Hva mener dere?');
    expect(post.poll?.options.map(o=>o.label)).toEqual(['Ja','Nei']);
    expect(post.media).toHaveLength(1);
  });
  it('legger ikke utkast i feeden',async()=>{
    const before = (await service.listFeed({ representationId:'rep-school', mode:'chronological' })).length;
    await service.publishPost({ representationId:'rep-school', body:'Utkast', audience:'public', status:'draft' });
    expect(await service.listFeed({ representationId:'rep-school', mode:'chronological' })).toHaveLength(before);
  });
  it('validerer innlegg med de delte skjemaene',async()=>{
    await expect(service.publishPost({ representationId:'rep-school', body:'   ', audience:'public', status:'published' })).rejects.toThrow('Skriv noe før du publiserer');
    await expect(service.publishPost({ representationId:'rep-school', body:'x'.repeat(6001), audience:'public', status:'published' })).rejects.toThrow();
    await expect(service.publishPost({ representationId:'rep-school', body:'Poll', audience:'public', status:'published', poll:{ options:['Bare én'] } })).rejects.toThrow('minst to svaralternativer');
  });
  it('avviser publisering fra representasjon uten publiseringsrett',async()=>{
    // Lokallaget gir bare rett via fylkesstyreregelen, som faller bort når Ida bytter til en skole i et annet lokallag.
    await service.assignRole({ organizationId:'elvebakken', userId:await personId('Sivert'), role:'school_admin' });
    await service.changeSchool({ schoolId:'kuben' });
    expect(signedIn(await service.getSession()).representations.find(r=>r.id==='rep-local')?.canPublish).toBe(false);
    await expect(service.publishPost({ representationId:'rep-local', body:'Hei', audience:'public', status:'published' })).rejects.toThrow('publiseringsrett');
  });
  it('legger til kommentar og øker telleren',async()=>{
    const comment = await service.addComment({ postId:'post-7', representationId:'rep-county', body:'Bra jobba!' });
    expect(comment).toMatchObject({ organizationId:'oslo-fylke', body:'Bra jobba!' });
    const post = (await service.listFeed({ representationId:'rep-school', mode:'chronological' })).find(p=>p.id==='post-7')!;
    expect(post.comments).toBe(1);
    expect(post.commentItems?.at(-1)?.id).toBe(comment.id);
    await expect(service.addComment({ postId:'post-7', representationId:'rep-county', body:' ' })).rejects.toThrow('tom');
  });
  it('støtter og fjerner støtte uten å telle dobbelt',async()=>{
    const likes = async()=>(await service.listFeed({ representationId:'rep-school', mode:'chronological' })).find(p=>p.id==='post-1')!.likes;
    const start = await likes();
    await service.setPostSupport({ postId:'post-1', supported:true });
    await service.setPostSupport({ postId:'post-1', supported:true });
    expect(await likes()).toBe(start+1);
    await service.setPostSupport({ postId:'post-1', supported:false });
    expect(await likes()).toBe(start);
  });
  it('teller én stemme per organisasjon og flytter den ved nytt valg',async()=>{
    const votes = async()=>Object.fromEntries((await service.listFeed({ representationId:'rep-school', mode:'chronological' })).find(p=>p.id==='post-6')!.poll!.options.map(o=>[o.id,o.votes]));
    const start = await votes();
    await service.vote({ postId:'post-6', optionId:'a', organizationId:'elvebakken' });
    await service.vote({ postId:'post-6', optionId:'b', organizationId:'elvebakken' });
    const after = await votes();
    expect(after.a).toBe(start.a);
    expect(after.b).toBe(start.b+1);
    await expect(service.vote({ postId:'post-1', optionId:'a', organizationId:'elvebakken' })).rejects.toThrow('ingen avstemning');
    await expect(service.vote({ postId:'post-6', optionId:'z', organizationId:'elvebakken' })).rejects.toThrow('Ukjent svaralternativ');
  });
  it('tar imot rapport på kjente innlegg',async()=>{
    await expect(service.reportPost({ postId:'post-2' })).resolves.toBeUndefined();
    await expect(service.reportPost({ postId:'finnes-ikke' })).rejects.toThrow('Ukjent innlegg');
  });
});

describe('DemoElevradsnettService: organisasjoner og arrangementer',()=>{
  it('følger og slutter å følge med riktig antall følgere',async()=>{
    const kuben = async()=>(await service.listOrganizations()).find(o=>o.id==='kuben')!;
    const start = (await kuben()).followers;
    await service.setFollow({ organizationId:'kuben', following:true });
    expect(await kuben()).toMatchObject({ following:true, followers:start+1 });
    await service.setFollow({ organizationId:'kuben', following:true });
    expect((await kuben()).followers).toBe(start+1);
    await service.setFollow({ organizationId:'kuben', following:false });
    expect(await kuben()).toMatchObject({ following:false, followers:start });
  });
  it('bytter aktiv representasjon bare til egne representasjoner',async()=>{
    await service.switchRepresentation('rep-county');
    expect(signedIn(await service.getSession()).activeRepresentationId).toBe('rep-county');
    await expect(service.switchRepresentation('finnes-ikke')).rejects.toThrow();
  });
});

describe('DemoElevradsnettService: innlogging og onboarding',()=>{
  let anon:DemoElevradsnettService;
  beforeEach(()=>{ anon = new DemoElevradsnettService({ signedIn:false }); });

  it('starter anonym og viser bare offentlig innhold',async()=>{
    expect(await anon.getSession()).toEqual({ status:'anonymous' });
    const feed = await anon.listFeed({ representationId:null, mode:'chronological' });
    expect(feed.length).toBeGreaterThan(0);
    expect(feed.every(p=>p.audience==='public')).toBe(true);
    expect((await anon.listOrganizations()).some(o=>o.following)).toBe(false);
    expect(await anon.listConversations()).toEqual([]);
  });
  it('avviser handlinger uten innlogging',async()=>{
    await expect(anon.setFollow({ organizationId:'kuben', following:true })).rejects.toThrow('logge inn');
    await expect(anon.setPostSupport({ postId:'post-1', supported:true })).rejects.toThrow('logge inn');
    await expect(anon.updateProfile({ displayName:'Ny Person' })).rejects.toThrow('logge inn');
  });
  it('logger inn med engangskode og avviser feil kode',async()=>{
    await expect(anon.requestLoginCode({ email:'ikke en e-post' })).rejects.toThrow('gyldig e-postadresse');
    await anon.requestLoginCode({ email:` ${DEMO_EMAIL.toUpperCase()} ` });
    await expect(anon.verifyLoginCode({ email:DEMO_EMAIL, code:'12345' })).rejects.toThrow('seks sifre');
    await expect(anon.verifyLoginCode({ email:DEMO_EMAIL, code:'000000' })).rejects.toThrow('feil eller utløpt');
    const session = signedIn(await anon.verifyLoginCode({ email:DEMO_EMAIL, code:DEMO_LOGIN_CODE }));
    expect(session.user.name).toBe('Ida Halvorsen');
    await anon.signOut();
    expect(await anon.getSession()).toEqual({ status:'anonymous' });
  });
  it('sender nye brukere til onboarding, og onboarding oppretter profilen uten verv',async()=>{
    await anon.requestLoginCode({ email:'ny@example.invalid' });
    expect(await anon.verifyLoginCode({ email:'ny@example.invalid', code:DEMO_LOGIN_CODE })).toEqual({ status:'onboarding', email:'ny@example.invalid' });
    await expect(anon.completeOnboarding({ schoolId:'kuben', displayName:'T' })).rejects.toThrow('minst to tegn');
    await expect(anon.completeOnboarding({ schoolId:'oslo-fylke', displayName:'Test Testesen' })).rejects.toThrow('Velg en skole');
    await expect(anon.completeOnboarding({ schoolId:'kuben', displayName:'Test Testesen', nextElection:inDays(-1) })).rejects.toThrow('fra i dag');
    await expect(anon.completeOnboarding({ schoolId:'kuben', displayName:'Test Testesen', nextElection:inDays(800) })).rejects.toThrow('to år');
    await anon.completeOnboarding({ schoolId:'kuben', displayName:'  Test Testesen ', nextElection:inDays(30) });
    const session = signedIn(await anon.getSession());
    expect(session.user).toMatchObject({ name:'Test Testesen', initials:'TT', schoolId:'kuben', email:'ny@example.invalid' });
    expect(session.representations).toEqual([]);
    expect(session.activeRepresentationId).toBeNull();
    expect(await anon.listSchoolHistory()).toHaveLength(1);
    await expect(anon.completeOnboarding({ schoolId:'kuben', displayName:'Test Testesen' })).rejects.toThrow('allerede');
  });
});

describe('DemoElevradsnettService: profil',()=>{
  it('endrer navn og validerer det',async()=>{
    await service.updateProfile({ displayName:'Ida Halvorsen Berg' });
    expect(signedIn(await service.getSession()).user).toMatchObject({ name:'Ida Halvorsen Berg', initials:'IH' });
    await expect(service.updateProfile({ displayName:' ' })).rejects.toThrow('minst to tegn');
  });
  it('setter og fjerner profilbilde, og avviser feil filtype og for store filer',async()=>{
    const url = await service.setAvatar(new Blob(['x'],{ type:'image/webp' }));
    expect(signedIn(await service.getSession()).user.avatarUrl).toBe(url);
    await service.removeAvatar();
    expect(signedIn(await service.getSession()).user.avatarUrl).toBeUndefined();
    await expect(service.setAvatar(new Blob(['x'],{ type:'image/gif' }))).rejects.toThrow('WebP, JPEG eller PNG');
    await expect(service.setAvatar(new Blob([new Uint8Array(5*1024*1024+1)],{ type:'image/jpeg' }))).rejects.toThrow('maks 5 MB');
  });
  it('bytter skole: verv ved gammel skole avsluttes, historikken beholdes',async()=>{
    await expect(service.changeSchool({ schoolId:'elvebakken' })).rejects.toThrow('allerede');
    await expect(service.changeSchool({ schoolId:'oslo-fylke' })).rejects.toThrow('Velg en skole');
    await expect(service.changeSchool({ schoolId:'kuben' })).rejects.toThrow('siste skoleadministrator');
    await service.assignRole({ organizationId:'elvebakken', userId:await personId('Sivert'), role:'school_admin' });
    await service.changeSchool({ schoolId:'kuben' });
    const session = signedIn(await service.getSession());
    expect(session.user.schoolId).toBe('kuben');
    expect(session.representations.map(r=>r.organizationId)).not.toContain('elvebakken');
    expect(session.representations.some(r=>r.organizationId==='kuben')).toBe(false);
    expect(session.activeRepresentationId).not.toBe('rep-school');
    const history = await service.listSchoolHistory();
    expect(history.map(h=>h.schoolId)).toEqual(['kuben','elvebakken']);
    expect(history[0].endedAt).toBeNull();
    expect(history[1].endedAt).not.toBeNull();
  });
});

describe('DemoElevradsnettService: verv og rettigheter',()=>{
  it('viser alle tilknytninger, og publiseringsretten kommer fra rettighetene',async()=>{
    const session = signedIn(await service.getSession());
    expect(session.representations.map(r=>[r.id,r.canPublish])).toEqual([['rep-school',true],['rep-local',true],['rep-county',true]]);
    expect(session.representations.every(r=>r.organizationStatus==='active')).toBe(true);
  });
  it('viser egne verv og rettigheter, også avsluttede',async()=>{
    const roles = await service.listMyRoles();
    expect(roles.filter(r=>r.kind==='role' && r.status==='active').map(r=>r.role)).toEqual(expect.arrayContaining(['school_admin','board_admin']));
    expect(roles.some(r=>r.kind==='office' && r.status==='ended' && r.title==='Elevrådsmedlem')).toBe(true);
  });
  it('lar administratoren gi og avslutte verv, og vervet vises offentlig',async()=>{
    const sivert = await personId('Sivert');
    await service.assignPublicOffice({ organizationId:'elvebakken', userId:sivert, title:'Kantineansvarlig' });
    expect((await service.listPublicOfficers('elvebakken')).some(o=>o.name==='Sivert Aune' && o.publicTitle==='Kantineansvarlig')).toBe(true);
    await expect(service.assignPublicOffice({ organizationId:'elvebakken', userId:sivert, title:'kantineansvarlig' })).rejects.toThrow('allerede dette vervet');
    await expect(service.assignPublicOffice({ organizationId:'elvebakken', userId:sivert, title:'K' })).rejects.toThrow('minst to tegn');
    const office = (await service.listOrganizationRoles('elvebakken')).find(r=>r.kind==='office' && r.title==='Kantineansvarlig')!;
    expect(office).toMatchObject({ userName:'Sivert Aune', status:'active', grantedByName:'Ida Halvorsen' });
    await service.endPublicOffice(office.id);
    expect((await service.listPublicOfficers('elvebakken')).some(o=>o.publicTitle==='Kantineansvarlig')).toBe(false);
    expect((await service.listOrganizationRoles('elvebakken')).find(r=>r.id===office.id)?.status).toBe('ended');
  });
  it('stopper verv til elever ved andre skoler',async()=>{
    await expect(service.assignPublicOffice({ organizationId:'elvebakken', userId:await personId('Emil','kuben'), title:'Medlem' })).rejects.toThrow('går ikke på denne skolen');
  });
  it('gir og fjerner rettigheter, men aldri til seg selv og aldri den siste administratoren',async()=>{
    const ida = signedIn(await service.getSession()).user.id;
    await expect(service.assignRole({ organizationId:'elvebakken', userId:ida, role:'content_manager' })).rejects.toThrow('deg selv');
    await expect(service.assignRole({ organizationId:'elvebakken', userId:await personId('Rania'), role:'board_admin' })).rejects.toThrow('denne typen organisasjon');
    const own = (await service.listOrganizationRoles('elvebakken')).find(r=>r.kind==='role' && r.role==='school_admin')!;
    await expect(service.revokeRole(own.id)).rejects.toThrow('minst én administrator');
    await service.assignRole({ organizationId:'elvebakken', userId:await personId('Rania'), role:'school_admin' });
    await service.revokeRole(own.id);
    expect((await service.listMyRoles()).find(r=>r.id===own.id)?.status).toBe('revoked');
    // Uten skoleadministrator er Elvebakken bare med via områderetten som styreadministrator.
    expect((await service.listAdminOrganizations()).find(o=>o.id==='elvebakken')?.myRole).toBe('board_admin');
  });
  it('viser hvilke organisasjoner og rettigheter administratoren har, slik serveren regner dem ut',async()=>{
    const orgs = await service.listAdminOrganizations();
    expect(orgs.find(o=>o.id==='elvebakken')).toMatchObject({ myRole:'school_admin', grantableRoles:['school_admin','content_manager'] });
    expect(orgs.find(o=>o.id==='oslo-fylke')).toMatchObject({ myRole:'board_admin', grantableRoles:['content_manager'] });
    expect(orgs.some(o=>o.id==='oslo-sentrum')).toBe(true);
    expect(orgs.some(o=>o.id==='kuben')).toBe(true);
    expect(orgs.some(o=>o.id==='nordahl' || o.id==='eo')).toBe(false);
  });
  it('skjuler roller og revisjonslogg for andre enn administratorer',async()=>{
    await service.signOut();
    await service.requestLoginCode({ email:'ny@example.invalid' });
    await service.verifyLoginCode({ email:'ny@example.invalid', code:DEMO_LOGIN_CODE });
    await service.completeOnboarding({ schoolId:'elvebakken', displayName:'Nils Ny' });
    expect(await service.listAdminOrganizations()).toEqual([]);
    await expect(service.listOrganizationRoles('elvebakken')).rejects.toThrow('ikke tilgang');
    await expect(service.listAuditLog('elvebakken')).rejects.toThrow('ikke tilgang');
  });
  it('lar styreadministrator avgjøre forespørsler om å bli skoleadministrator',async()=>{
    const [request] = (await service.listSchoolAdminRequests()).filter(r=>r.canDecide);
    expect(request).toMatchObject({ userName:'Frida Aas', schoolId:'ohg', status:'pending', mine:false });
    await service.decideSchoolAdminRequest({ requestId:request.id, approve:true, reason:'Bekreftet.' });
    expect(await service.listSchoolAdminRequests()).toEqual([]);
    expect((await service.listOrganizationRoles('ohg')).some(r=>r.kind==='role' && r.role==='school_admin' && r.userName==='Frida Aas')).toBe(true);
    await expect(service.decideSchoolAdminRequest({ requestId:request.id, approve:true })).rejects.toThrow('allerede behandlet');
  });
  it('lar en elev be om å bli skoleadministrator for egen skole, og trekke forespørselen',async()=>{
    await expect(service.requestSchoolAdmin({ schoolId:'elvebakken' })).rejects.toThrow('allerede skoleadministrator');
    await service.signOut();
    await service.requestLoginCode({ email:'ny@example.invalid' });
    await service.verifyLoginCode({ email:'ny@example.invalid', code:DEMO_LOGIN_CODE });
    await service.completeOnboarding({ schoolId:'kuben', displayName:'Nils Ny' });
    await expect(service.requestSchoolAdmin({ schoolId:'elvebakken' })).rejects.toThrow('egen skole');
    await service.requestSchoolAdmin({ schoolId:'kuben', message:'Jeg er leder.' });
    await expect(service.requestSchoolAdmin({ schoolId:'kuben' })).rejects.toThrow('allerede registrert');
    const [mine] = await service.listSchoolAdminRequests();
    expect(mine).toMatchObject({ mine:true, canDecide:false, status:'pending', schoolName:'Kuben videregående skole' });
    await expect(service.decideSchoolAdminRequest({ requestId:mine.id, approve:true })).rejects.toThrow('deg selv');
    await service.cancelSchoolAdminRequest(mine.id);
    expect((await service.listSchoolAdminRequests())[0].status).toBe('cancelled');
  });
  it('logger alle endringer i revisjonsloggen med navn',async()=>{
    await service.assignPublicOffice({ organizationId:'elvebakken', userId:await personId('Maja'), title:'Nestleder' });
    const [entry] = await service.listAuditLog('elvebakken');
    expect(entry).toMatchObject({ action:'office.assigned', actorName:'Ida Halvorsen', subjectName:'Maja Solheim' });
  });
  it('viser deaktiverte organisasjoner, men ikke i listen',async()=>{
    expect((await service.listOrganizations()).some(o=>o.id==='fagerborg')).toBe(false);
    expect(await service.getOrganization('fagerborg')).toMatchObject({ status:'deactivated', officers:[] });
    expect(await service.getOrganization('finnes-ikke')).toBeNull();
  });
});

describe('DemoElevradsnettService: meldinger',()=>{
  it('gjenbruker eksisterende samtale med en organisasjon',async()=>{
    const conversation = await service.openConversation({ organizationId:'kuben' });
    expect(conversation.id).toBe('c1');
  });
  it('oppretter ny samtale når ingen finnes',async()=>{
    const conversation = await service.openConversation({ organizationId:'hartvig' });
    expect(conversation).toMatchObject({ name:'Hartvig Nissen elevråd', subtitle:'Oslo · Elevråd', messages:[] });
    expect((await service.listConversations())[0].id).toBe(conversation.id);
    expect((await service.openConversation({ organizationId:'hartvig' })).id).toBe(conversation.id);
  });
  it('sender melding og validerer tom tekst',async()=>{
    const message = await service.sendMessage({ conversationId:'c1', body:' Hei! ' });
    expect(message).toMatchObject({ from:'Ida', mine:true, text:'Hei!' });
    expect((await service.listConversations()).find(c=>c.id==='c1')!.messages.at(-1)!.id).toBe(message.id);
    await expect(service.sendMessage({ conversationId:'c1', body:'   ' })).rejects.toThrow('tom');
    await expect(service.sendMessage({ conversationId:'finnes-ikke', body:'Hei' })).rejects.toThrow('Ukjent samtale');
  });
  it('markerer samtale som lest',async()=>{
    await service.markConversationRead('c2');
    expect((await service.listConversations()).find(c=>c.id==='c2')!.unread).toBe(0);
  });
});

describe('createService',()=>{
  it('bruker demodata når Supabase ikke er konfigurert',()=>{
    expect(createService({})).toBeInstanceOf(DemoElevradsnettService);
    expect(createService({ VITE_SUPABASE_URL:'https://x.supabase.co' })).toBeInstanceOf(DemoElevradsnettService);
  });
  it('bruker Supabase når URL og anon-nøkkel er satt',()=>{
    expect(createService({ VITE_SUPABASE_URL:'https://x.supabase.co', VITE_SUPABASE_ANON_KEY:'anon' })).toBeInstanceOf(SupabaseElevradsnettService);
  });
  it('kaster en tydelig feil for metoder uten RPC',async()=>{
    const supabase = createService({ VITE_SUPABASE_URL:'https://x.supabase.co', VITE_SUPABASE_ANON_KEY:'anon' });
    await expect(supabase.setFollow({ organizationId:'x', following:true })).rejects.toBeInstanceOf(NotImplementedError);
    await expect(supabase.reportPost({ postId:'x' })).rejects.toThrow('«reportPost» er ikke koblet til Supabase ennå');
  });
  it('starter demoen uten innlogging',async()=>{
    expect(await createService({}).getSession()).toEqual({ status:'anonymous' });
  });
});

/** Et tidspunkt om et antall dager, som ISO-tekst. */
const at = (days:number, hours = 0)=>new Date(Date.now()+days*86400000+hours*3600000).toISOString();
const newEvent = (overrides:Partial<Parameters<DemoElevradsnettService['saveEvent']>[0]> = {})=>({
  organizerId:'oslo-fylke', title:'Testkurs', description:'Et kurs for elevråd.', category:'kurs' as const, startsAt:at(10), endsAt:at(10,3),
  location:'Oslo', audience:'county' as const, status:'published' as const, ...overrides });

describe('DemoElevradsnettService: arrangementer (§8)',()=>{
  it('lister arrangører bare der brukeren er styreadministrator',async()=>{
    expect((await service.listEventOrganizers()).map(o=>o.id)).toEqual(['oslo-fylke','oslo-sentrum']);
    await expect(service.saveEvent(newEvent({ organizerId:'elvebakken' }))).rejects.toThrow('ikke tilgang');
    await expect(service.saveEvent(newEvent({ organizerId:'eo' }))).rejects.toThrow('ikke tilgang');
  });
  it('validerer arrangementet før det lagres',async()=>{
    await expect(service.saveEvent(newEvent({ title:'X' }))).rejects.toThrow('minst tre tegn');
    await expect(service.saveEvent(newEvent({ endsAt:at(9) }))).rejects.toThrow('Slutten må være etter starten');
    await expect(service.saveEvent(newEvent({ location:undefined }))).rejects.toThrow('Oppgi sted eller lenke');
    await expect(service.saveEvent(newEvent({ location:undefined, digitalUrl:'http://usikker.example' }))).rejects.toThrow('https://');
    await expect(service.saveEvent(newEvent({ registrationDeadline:at(11) }))).rejects.toThrow('fristen');
    await expect(service.saveEvent(newEvent({ startsAt:at(-1), endsAt:at(1) }))).rejects.toThrow('starten kan ikke være passert');
  });
  it('viser utkast bare for arrangøren, og et publisert arrangement kan ikke bli utkast igjen',async()=>{
    const id = await service.saveEvent(newEvent({ status:'draft' }));
    expect((await service.listEvents()).find(e=>e.id===id)).toMatchObject({ status:'draft', canEdit:true, audienceCode:'county' });
    await service.signOut();
    expect((await service.listEvents()).some(e=>e.id===id)).toBe(false);
    await service.requestLoginCode({ email:DEMO_EMAIL });
    await service.verifyLoginCode({ email:DEMO_EMAIL, code:DEMO_LOGIN_CODE });
    await service.saveEvent(newEvent({ id, title:'Testkurs i Oslo' }));
    expect((await service.listEvents()).find(e=>e.id===id)).toMatchObject({ status:'published', title:'Testkurs i Oslo' });
    await expect(service.saveEvent(newEvent({ id, status:'draft' }))).rejects.toThrow('denne statusen');
  });
  it('holder personlig interesse adskilt fra påmelding',async()=>{
    const event = async()=>(await service.listEvents()).find(e=>e.id==='skolering')!;
    const start = await event();
    await service.setEventInterest({ eventId:'skolering', interested:true });
    expect(await event()).toMatchObject({ interested:start.interested+1, interestedByMe:true, registered:start.registered });
    await service.registerForEvent({ eventId:'skolering', organizationId:'elvebakken', registered:true });
    expect(await event()).toMatchObject({ interested:start.interested+1, registered:start.registered+1 });
    await service.setEventInterest({ eventId:'skolering', interested:false });
    expect(await event()).toMatchObject({ interested:start.interested, interestedByMe:false, registered:start.registered+1 });
  });
  it('setter organisasjoner på venteliste når det er fullt, og rykker opp ved avmelding',async()=>{
    const id = await service.saveEvent(newEvent({ capacity:1 }));
    expect(await service.registerForEvent({ eventId:id, organizationId:'elvebakken', registered:true })).toBe('registered');
    expect(await service.registerForEvent({ eventId:id, organizationId:'oslo-sentrum', registered:true })).toBe('waitlisted');
    await service.registerForEvent({ eventId:id, organizationId:'elvebakken', registered:false });
    const p = await service.getEventParticipation(id);
    expect(p.organizations.find(o=>o.organizationId==='oslo-sentrum')?.status).toBe('registered');
    expect(p.organizations.find(o=>o.organizationId==='elvebakken')?.status).toBe('cancelled');
  });
  it('stopper påmelding utenfor målgruppen og uten rettighet',async()=>{
    const national = (await service.listEvents()).find(e=>e.id==='skolering')!;
    expect(national.audienceCode).toBe('county');
    await expect(service.registerForEvent({ eventId:'skolering', organizationId:'kuben', registered:true })).rejects.toThrow('ikke tilgang');
  });
  it('melder på delegater som varsles og må bekrefte selv, med grense per organisasjon',async()=>{
    const id = await service.saveEvent(newEvent({ seatsPerOrganization:1 }));
    await service.registerForEvent({ eventId:id, organizationId:'elvebakken', registered:true });
    const registrationId = (await service.getEventParticipation(id)).organizations.find(o=>o.organizationId==='elvebakken')!.registrationId!;
    const candidates = await service.searchDelegateCandidates({ registrationId, query:'sivert' });
    expect(candidates).toEqual([expect.objectContaining({ name:'Sivert Aune', officeTitle:'Nestleder' })]);
    await service.addEventDelegate({ registrationId, userId:candidates[0].id });
    expect(service.notifications.at(-1)).toMatchObject({ userId:candidates[0].id, type:'event.delegate_invited', link:`#/arrangementer/${id}` });
    await expect(service.addEventDelegate({ registrationId, userId:await personId('Rania') })).rejects.toThrow('ingen ledige plasser');
    await expect(service.searchDelegateCandidates({ registrationId:'finnes-ikke', query:'' })).rejects.toThrow('ikke tilgang');
    const delegate = (await service.getEventParticipation(id)).organizations.find(o=>o.organizationId==='elvebakken')!.delegates[0];
    expect(delegate).toMatchObject({ name:'Sivert Aune', status:'invited', officeTitle:'Nestleder' });
    await expect(service.respondToDelegation({ delegateId:delegate.id, accept:true })).rejects.toThrow('Fant ikke delegaten');
  });
  it('lar Ida svare på egen invitasjon, og viser den på profilen',async()=>{
    const cv = await service.getPersonCv('user-ida');
    const invitation = cv!.invitations.find(i=>i.eventId==='fylkessamling')!;
    expect(invitation.status).toBe('invited');
    await service.respondToDelegation({ delegateId:invitation.delegateId, accept:true });
    expect((await service.getEventParticipation('fylkessamling')).invitations[0]).toMatchObject({ status:'confirmed', organizationName:'Elvebakken vgs elevråd' });
  });
  it('gir CV-oppføring bare etter at arrangøren har bekreftet oppmøte',async()=>{
    const id = await service.saveEvent(newEvent({ organizerId:'oslo-sentrum', audience:'local', startsAt:at(0,1), endsAt:at(0,3) }));
    await service.registerForEvent({ eventId:id, organizationId:'elvebakken', registered:true });
    const registrationId = (await service.getEventParticipation(id)).organizations.find(o=>o.organizationId==='elvebakken')!.registrationId!;
    await service.addEventDelegate({ registrationId, userId:'user-ida' });
    const [invitation] = (await service.getEventParticipation(id)).invitations;
    await service.respondToDelegation({ delegateId:invitation.delegateId, accept:true });
    const before = (await service.getPersonCv('user-ida'))!.events.length;
    expect((await service.getOrganizationCv('elvebakken')).some(e=>e.eventId===id)).toBe(false);
    await expect(service.confirmAttendance({ delegateId:invitation.delegateId, attended:true })).rejects.toThrow('har startet');
    // Arrangementet starter.
    (service as unknown as { events:{ id:string; startsAt:string }[] }).events.find(e=>e.id===id)!.startsAt = at(0,-1);
    await expect(service.registerForEvent({ eventId:id, organizationId:'elvebakken', registered:false })).rejects.toThrow('stengt');
    expect(await service.confirmAllAttendance(id)).toBe(1);
    const cv = (await service.getPersonCv('user-ida'))!;
    expect(cv.events.length).toBe(before+1);
    expect(cv.events.find(e=>e.eventId===id)).toMatchObject({ organizationName:'Elvebakken vgs elevråd', officeTitle:'Elevrådsleder', elevtinget:false });
    expect((await service.getOrganizationCv('elvebakken')).find(e=>e.eventId===id)).toMatchObject({ name:'Ida Halvorsen', userId:'user-ida' });
    await service.setEventStatus({ eventId:id, status:'completed' });
    await expect(service.saveEvent(newEvent({ id, organizerId:'oslo-sentrum' }))).rejects.toThrow('kan ikke endres');
  });
  it('viser verv, bekreftede arrangementer og én stjerne per Elevting på CV-en',async()=>{
    const cv = (await service.getPersonCv('user-ida'))!;
    expect(cv.stars).toBe(1);
    expect(cv.events.map(e=>e.eventId)).toEqual(['fylkessamling-var','elevtinget-i-fjor']);
    expect(cv.offices.map(o=>o.title)).toContain('Elevrådsleder');
    expect(cv.offices.find(o=>o.title==='Elevrådsmedlem')).toMatchObject({ active:false });
    const school = await service.getOrganizationCv('elvebakken');
    expect(school.filter(e=>e.eventId==='elevtinget-i-fjor').map(e=>[e.name,e.officeTitle])).toEqual([['Ida Halvorsen','Elevrådsmedlem'],['Sivert Aune','Nestleder']]);
  });
  it('viser CV uten innlogging, men ikke invitasjoner, og ingen CV for deaktiverte personer',async()=>{
    await service.signOut();
    const cv = (await service.getPersonCv('user-ida'))!;
    expect(cv.invitations).toEqual([]);
    expect(cv.events.length).toBeGreaterThan(0);
    expect(await service.getPersonCv('person-jonas-berg')).toBeNull();
    expect(await service.getEventParticipation('fylkessamling')).toMatchObject({ canEdit:false, organizations:[], attendance:null });
  });
  it('avlyser og varsler delegatene',async()=>{
    await service.setEventStatus({ eventId:'fylkessamling', status:'cancelled' });
    expect(service.notifications.some(n=>n.type==='event.cancelled' && n.userId==='user-ida')).toBe(true);
    expect((await service.listEvents()).find(e=>e.id==='fylkessamling')?.status).toBe('cancelled');
  });
  it('viser lenken til digitale møter bare for arrangøren og deltakerne',async()=>{
    expect((await service.listEvents()).find(e=>e.id==='skolemiljo')?.digitalUrl).toBeUndefined();
    await service.registerForEvent({ eventId:'skolemiljo', organizationId:'elvebakken', registered:true });
    expect((await service.listEvents()).find(e=>e.id==='skolemiljo')?.digitalUrl).toBe('https://meet.example.invalid/skolemiljo');
  });
});
