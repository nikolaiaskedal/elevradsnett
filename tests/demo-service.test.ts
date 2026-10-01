import { beforeEach, describe, expect, it } from 'vitest';
import { NotImplementedError } from '@/lib/services/contracts';
import { createService } from '@/lib/services/create-service';
import type { Session, SignedInSession } from '@/lib/domain/types';
import { DEMO_EMAIL, DEMO_LOGIN_CODE, DemoElevradsnettService } from '@/lib/services/demo-service';
import { SupabaseElevradsnettService } from '@/lib/services/supabase-service';

let service:DemoElevradsnettService;
beforeEach(()=>{ service = new DemoElevradsnettService(); });

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
  it('registrerer, bytter og fjerner arrangementsrespons',async()=>{
    const event = async()=>(await service.listEvents()).find(e=>e.id==='skolering')!;
    const start = await event();
    await service.setEventResponse({ eventId:'skolering', organizationId:'elvebakken', response:'going' });
    expect((await event()).registered).toBe(start.registered+1);
    await service.setEventResponse({ eventId:'skolering', organizationId:'elvebakken', response:'interested' });
    expect(await event()).toMatchObject({ registered:start.registered, interested:start.interested+1 });
    await service.setEventResponse({ eventId:'skolering', organizationId:'elvebakken', response:null });
    expect(await event()).toMatchObject({ registered:start.registered, interested:start.interested });
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
