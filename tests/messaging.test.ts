import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatMessageTime } from '@/lib/domain/messaging';
import { DemoElevradsnettService } from '@/lib/services/demo-service';
import { SupabaseElevradsnettService, toNorwegianError } from '@/lib/services/supabase-service';

let service:DemoElevradsnettService;
beforeEach(()=>{ service = new DemoElevradsnettService(); });

const byName = async (name:string)=>(await service.listConversations()).find(c=>c.name===name)!;
async function personId(name:string) {
  const hit = (await service.searchRecipients(name)).find(r=>r.kind==='person' && r.name===name);
  if (!hit) throw new Error(`Fant ikke ${name}`);
  return hit.id;
}

describe('DemoElevradsnettService: samtaler',()=>{
  it('viser direktemeldinger med navnet til den andre, grupper og systemstyrte grupper for vervene',async()=>{
    const list = await service.listConversations();
    expect(list.find(c=>c.id==='c1')).toMatchObject({ kind:'direct', name:'Emil Strand', unread:0, members:2 });
    expect(list.find(c=>c.id==='c2')).toMatchObject({ kind:'managed', name:'Elevorganisasjonen i Oslo', organizationId:'oslo-fylke', unread:2 });
    expect(list.find(c=>c.id==='c3')).toMatchObject({ kind:'group', name:'Debattopplegg', isAdmin:true, members:3 });
    // Ida har verv i tre organisasjoner, og er dermed med i tre systemstyrte grupper.
    expect(list.filter(c=>c.kind==='managed').map(c=>c.organizationId ?? '').sort((a,b)=>a.localeCompare(b))).toEqual(['elvebakken','oslo-fylke','oslo-sentrum']);
    // Ingen samtale har en organisasjon som mottaker utenom de systemstyrte gruppene.
    expect(list.filter(c=>c.kind!=='managed').every(c=>!c.organizationId)).toBe(true);
  });
  it('henter meldinger med avsender og egne meldinger merket',async()=>{
    const messages = await service.listMessages({ conversationId:'c1' });
    expect(messages).toHaveLength(4);
    expect(messages[0]).toMatchObject({ from:'Emil Strand', mine:false });
    expect(messages[1]).toMatchObject({ from:'Ida Halvorsen', mine:true });
  });
  it('sender melding, oppdaterer listen og avviser tomme meldinger og ukjente samtaler',async()=>{
    const message = await service.sendMessage({ conversationId:'c1', body:' Hei! ' });
    expect(message).toMatchObject({ mine:true, text:'Hei!', attachments:[] });
    expect((await service.listMessages({ conversationId:'c1' })).at(-1)!.id).toBe(message.id);
    expect((await service.listConversations())[0]).toMatchObject({ id:'c1', lastMessage:{ text:'Hei!', mine:true } });
    await expect(service.sendMessage({ conversationId:'c1', body:'   ' })).rejects.toThrow('tom');
    await expect(service.sendMessage({ conversationId:'finnes-ikke', body:'Hei' })).rejects.toThrow('Fant ikke samtalen');
  });
  it('markerer som lest og demper',async()=>{
    await service.markConversationRead('c2');
    await service.setConversationMuted({ conversationId:'c2', muted:true });
    expect(await byName('Elevorganisasjonen i Oslo')).toMatchObject({ unread:0, muted:true });
  });
  it('sender vedlegg og gir en lenke til dem, men avviser filtyper som ikke er tillatt',async()=>{
    const pdf = new File(['%PDF-1.4'],'referat.pdf',{ type:'application/pdf' });
    const message = await service.sendMessage({ conversationId:'c1', body:'', attachments:[pdf] });
    expect(message.attachments[0]).toMatchObject({ fileName:'referat.pdf', mimeType:'application/pdf', byteSize:8 });
    expect(await service.getAttachmentUrl(message.attachments[0].path)).toMatch(/^blob:/);
    expect((await byName('Emil Strand')).lastMessage?.text).toBe('Vedlegg');
    const text = new File(['hei'],'notat.txt',{ type:'text/plain' });
    await expect(service.sendMessage({ conversationId:'c1', body:'Se her', attachments:[text] })).rejects.toThrow('bilde');
  });
});

describe('DemoElevradsnettService: nye samtaler og søk',()=>{
  it('finner personer og organisasjoner, og starter én direktesamtale per person',async()=>{
    const results = await service.searchRecipients('kuben');
    expect(results.some(r=>r.kind==='organization' && r.id==='kuben')).toBe(true);
    expect(await service.searchRecipients('k')).toEqual([]);
    const mathilde = await personId('Mathilde Rø');
    const id = await service.startDirectConversation(mathilde);
    expect(await service.startDirectConversation(mathilde)).toBe(id);
    expect(await byName('Mathilde Rø')).toMatchObject({ id, kind:'direct', lastMessage:undefined });
  });
  it('viser kontaktpersoner for en organisasjon og oppretter en vanlig gruppe med dem',async()=>{
    const contacts = await service.listOrganizationContacts('kuben');
    expect(contacts.map(c=>c.name)).toContain('Emil Strand');
    const id = await service.createOrganizationGroup('kuben');
    const group = (await service.listConversations()).find(c=>c.id===id)!;
    expect(group).toMatchObject({ kind:'group', isAdmin:true, members:contacts.length+1 });
    expect(group.organizationId).toBeUndefined();
  });
  it('validerer nye grupper og lar administrator legge til personer',async()=>{
    await expect(service.createGroup({ name:'Tom', memberIds:[] })).rejects.toThrow('Velg minst én person');
    await expect(service.createGroup({ name:' ', memberIds:['x'] })).rejects.toThrow('Gi gruppen et navn');
    const id = await service.createGroup({ name:'Planlegging', memberIds:[await personId('Emil Strand')] });
    await service.addConversationMembers({ conversationId:id, userIds:[await personId('Vetle Aunemo')] });
    expect((await service.listConversationMembers(id)).map(m=>m.name)).toEqual(['Ida Halvorsen','Emil Strand','Vetle Aunemo']);
  });
  it('lar brukeren forlate vanlige grupper, men ikke systemstyrte',async()=>{
    await service.leaveConversation('c3');
    expect((await service.listConversations()).some(c=>c.id==='c3')).toBe(false);
    await expect(service.listMessages({ conversationId:'c3' })).rejects.toThrow('Fant ikke samtalen');
    await expect(service.leaveConversation('c2')).rejects.toThrow('følger vervene');
  });
  it('tar brukeren ut av den systemstyrte gruppen når vervet avsluttes',async()=>{
    await service.endPublicOffice('rep-county');
    expect((await service.listConversations()).some(c=>c.id==='c2')).toBe(false);
    await expect(service.sendMessage({ conversationId:'c2', body:'Hei' })).rejects.toThrow('Fant ikke samtalen');
  });
});

describe('DemoElevradsnettService: lest-status, sletting, rapportering og blokkering',()=>{
  it('viser lest-status bare når brukeren har slått den på',async()=>{
    expect((await service.listMessages({ conversationId:'c1' }))[1].readBy).toBeNull();
    await service.setReadReceipts(true);
    expect(await service.getMessageSettings()).toEqual({ readReceipts:true });
    const messages = await service.listMessages({ conversationId:'c1' });
    // Emil har lest fram til sin egen siste melding, som kom mellom Idas to.
    expect(messages[1].readBy).toBe(1);
    expect(messages[3].readBy).toBe(0);
    expect(messages[0].readBy).toBeNull();
  });
  it('sletter en melding bare for egen visning',async()=>{
    const [first] = await service.listMessages({ conversationId:'c1' });
    await service.hideMessage(first.id);
    expect((await service.listMessages({ conversationId:'c1' })).some(m=>m.id===first.id)).toBe(false);
    await expect(service.hideMessage(first.id)).rejects.toThrow('Fant ikke meldingen');
  });
  it('rapporterer en konkret melding fra andre, én gang',async()=>{
    const [fromEmil,mine] = await service.listMessages({ conversationId:'c1' });
    await service.reportMessage({ messageId:fromEmil.id, category:'harassment' });
    await expect(service.reportMessage({ messageId:fromEmil.id, category:'spam' })).rejects.toThrow('allerede rapportert');
    await expect(service.reportMessage({ messageId:mine.id, category:'spam' })).rejects.toThrow('din egen melding');
  });
  it('stopper direktemeldinger og skjuler personen i søket ved blokkering',async()=>{
    const emil = await personId('Emil Strand');
    await service.blockUser(emil);
    expect(await service.listBlockedUsers()).toEqual([{ userId:emil, name:'Emil Strand' }]);
    await expect(service.sendMessage({ conversationId:'c1', body:'Hei?' })).rejects.toThrow('Du kan ikke sende meldinger');
    await expect(service.startDirectConversation(emil)).rejects.toThrow('Du kan ikke sende meldinger');
    expect((await service.searchRecipients('Emil')).some(r=>r.id===emil)).toBe(false);
    // Meldingene hans skjules også i grupper.
    expect((await service.listMessages({ conversationId:'c1' })).every(m=>m.mine)).toBe(true);
    await service.unblockUser(emil);
    await expect(service.sendMessage({ conversationId:'c1', body:'Beklager!' })).resolves.toMatchObject({ text:'Beklager!' });
  });
  it('krever innlogging',async()=>{
    const anon = new DemoElevradsnettService({ signedIn:false });
    expect(await anon.listConversations()).toEqual([]);
    await expect(anon.searchRecipients('Emil')).rejects.toThrow('logge inn');
    await expect(anon.sendMessage({ conversationId:'c1', body:'Hei' })).rejects.toThrow('logge inn');
  });
});

/** Falsk Supabase-klient med RPC-er og lagring, som registrerer kallene. */
function fakeClient(rpcs:Record<string,unknown>, userId:string|null = 'u1') {
  const calls:{ name:string; args:unknown }[] = [];
  const upload = vi.fn(async(path:string)=>({ data:{ path }, error:null }));
  const remove = vi.fn(async()=>({ data:[], error:null }));
  const client = {
    auth:{ getSession:async()=>({ data:{ session:userId?{ user:{ id:userId } }:null } }) },
    rpc:async(name:string,args?:unknown)=>{ calls.push({ name,args }); const value = rpcs[name]; return value instanceof Error ? { data:null, error:{ message:value.message } } : { data:value ?? null, error:null }; },
    storage:{ from:()=>({ upload, remove, getPublicUrl:(path:string)=>({ data:{ publicUrl:path } }), createSignedUrl:async(path:string,seconds:number)=>({ data:{ signedUrl:`https://signed.test/${path}?t=${seconds}` }, error:null }) }) },
  };
  return { client:client as unknown as SupabaseClient, calls, upload, remove };
}

describe('SupabaseElevradsnettService: meldinger',()=>{
  it('henter ingen samtaler uten innlogging, og gjør om radene fra list_my_conversations',async()=>{
    const anon = fakeClient({},null);
    expect(await new SupabaseElevradsnettService(anon.client).listConversations()).toEqual([]);
    expect(anon.calls).toEqual([]);
    const { client } = fakeClient({ list_my_conversations:[{ id:'c1', kind:'direct', name:'Emil Strand', organization_id:null, other_user_id:'u2', member_count:2, unread_count:3, muted:false,
      is_admin:false, last_message_body:null, last_message_at:'2026-09-30T10:00:00Z', last_message_mine:false, last_message_has_attachment:true, created_at:'2026-09-01T10:00:00Z' }] });
    const [c] = await new SupabaseElevradsnettService(client).listConversations();
    expect(c).toMatchObject({ id:'c1', kind:'direct', name:'Emil Strand', initials:'ES', otherUserId:'u2', unread:3, lastMessage:{ text:'Vedlegg', mine:false } });
  });
  it('laster opp vedlegg i egen mappe i samtalen før meldingen sendes',async()=>{
    const { client,calls,upload } = fakeClient({ send_message:[{ id:'m1', created_at:'2026-09-30T10:00:00Z' }] });
    const pdf = new File(['%PDF'],'referat.pdf',{ type:'application/pdf' });
    const message = await new SupabaseElevradsnettService(client).sendMessage({ conversationId:'c1', body:' Hei ', attachments:[pdf] });
    const path = upload.mock.calls[0][0];
    expect(path).toMatch(/^c1\/u1\/[0-9a-f-]+\.pdf$/);
    expect(calls).toEqual([{ name:'send_message', args:{ p_conversation:'c1', p_body:'Hei', p_attachments:[{ path, mime_type:'application/pdf', byte_size:4, file_name:'referat.pdf' }] } }]);
    expect(message).toMatchObject({ id:'m1', mine:true, text:'Hei', attachments:[{ path, fileName:'referat.pdf' }] });
  });
  it('fjerner opplastede vedlegg og gir norsk feilmelding når sendingen feiler',async()=>{
    const { client,remove } = fakeClient({ send_message:new Error('blocked') });
    const image = new File(['x'],'bilde.webp',{ type:'image/webp' });
    await expect(new SupabaseElevradsnettService(client).sendMessage({ conversationId:'c1', body:'', attachments:[image] })).rejects.toThrow('Du kan ikke sende meldinger til denne personen.');
    expect(remove).toHaveBeenCalledTimes(1);
  });
  it('søker først fra to tegn, og gir tidsbegrensede lenker til vedlegg',async()=>{
    const { client,calls } = fakeClient({ search_message_recipients:[
      { kind:'person', id:'u2', name:'Emil Strand', detail:'Kuben vgs', organization_type:null },
      { kind:'organization', id:'o1', name:'Kuben vgs', detail:'Oslo', organization_type:'school' }] });
    const s = new SupabaseElevradsnettService(client);
    expect(await s.searchRecipients('e')).toEqual([]);
    expect(calls).toEqual([]);
    expect(await s.searchRecipients('kub')).toEqual([{ kind:'person', id:'u2', name:'Emil Strand', schoolName:'Kuben vgs' },{ kind:'organization', id:'o1', name:'Kuben vgs', county:'Oslo', type:'school' }]);
    expect(await s.getAttachmentUrl('c1/u1/a.pdf')).toBe('https://signed.test/c1/u1/a.pdf?t=600');
  });
  it('oversetter feilene fra meldings-RPC-ene',()=>{
    expect(toNorwegianError({ message:'conversation not found' }).message).toBe('Fant ikke samtalen, eller du er ikke lenger med i den.');
    expect(toNorwegianError({ message:'cannot leave' }).message).toContain('følger vervene');
  });
});

describe('formatMessageTime',()=>{
  it('viser klokkeslett i dag, «i går» og ellers dato',()=>{
    const now = new Date('2026-10-01T12:00:00Z');
    expect(formatMessageTime('2026-10-01T07:12:00Z',now)).toBe('09:12');
    expect(formatMessageTime('2026-09-30T07:12:00Z',now)).toBe('i går 09:12');
    expect(formatMessageTime('2026-09-12T07:12:00Z',now)).toMatch(/^12\. sep/);
    expect(formatMessageTime('2025-09-12T07:12:00Z',now)).toMatch(/2025/);
  });
});
