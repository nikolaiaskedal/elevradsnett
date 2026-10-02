import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildDigestEmail, buildInviteEmail, appLink, DIGEST_MAX_ITEMS } from '@/supabase/functions/_shared/digest';
import { startHandoverSchema } from '@/lib/domain/validation';
import { DemoElevradsnettService } from '@/lib/services/demo-service';
import { SupabaseElevradsnettService } from '@/lib/services/supabase-service';

const inDays = (days:number)=>{ const d = new Date(); d.setDate(d.getDate()+days); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

let service:DemoElevradsnettService;
beforeEach(()=>{ service = new DemoElevradsnettService(); });
async function personId(name:string) {
  const [person] = await service.searchAssignablePeople({ organizationId:'elvebakken', query:name });
  if (!person) throw new Error(`Fant ikke ${name}`);
  return person.id;
}

describe('Demo: varsler',()=>{
  it('viser Idas varsler med uleste først i tid, og merker dem som lest',async()=>{
    const list = await service.listNotifications();
    expect(list.length).toBeGreaterThan(0);
    const times = list.map(n=>n.createdAt);
    expect(times).toEqual([...times].sort().reverse());
    expect(list.some(n=>!n.read)).toBe(true);
    await service.markNotificationsRead([list[0].id]);
    expect((await service.listNotifications()).find(n=>n.id===list[0].id)?.read).toBe(true);
    await service.markNotificationsRead();
    expect((await service.listNotifications()).every(n=>n.read)).toBe(true);
  });
  it('lagrer innstillingene per kategori og kanal',async()=>{
    await service.setNotificationPreferences({ inApp:true, email:true, inAppOff:['events'], emailOff:['events','messages'] });
    expect(await service.getNotificationPreferences()).toEqual({ inApp:true, email:true, inAppOff:['events'], emailOff:['messages','events'] });
  });
  it('avviser ukjente kategorier',async()=>{
    await expect(service.setNotificationPreferences({ inApp:true, email:true, inAppOff:['tull' as never], emailOff:[] })).rejects.toThrow();
  });
  it('har ingen varsler for utloggede',async()=>{
    expect(await new DemoElevradsnettService({ signedIn:false }).listNotifications()).toEqual([]);
  });
});

describe('Demo: styreoverføring',()=>{
  it('viser oversikten for skoleadministrator, med dato, styre og administratorer',async()=>{
    const o = await service.getHandoverOverview('elvebakken');
    expect(o.canManage).toBe(true);
    expect(o.expectedHandoverOn).toBe(inDays(12));
    expect(o.adminCount).toBeGreaterThanOrEqual(1);
    expect(o.members.some(m=>m.name==='Ida Halvorsen' && m.roles.includes('school_admin'))).toBe(true);
    expect(o.handover).toBeNull();
  });
  it('krever en ny skoleadministrator, og åpner bare én overføring om gangen',async()=>{
    const sivert = await personId('Sivert');
    await expect(service.startHandover({ organizationId:'elvebakken', handoverOn:inDays(12), oldBoardEndsOn:inDays(11), activationDate:inDays(12),
      invites:[{ userId:sivert, publicTitle:'Elevrådsleder' }] })).rejects.toThrow('Velg minst én ny skoleadministrator.');
    const id = await service.startHandover({ organizationId:'elvebakken', handoverOn:inDays(12), oldBoardEndsOn:inDays(11), activationDate:inDays(12),
      invites:[{ userId:sivert, publicTitle:'Elevrådsleder', adminRole:'school_admin' },{ email:'ny@example.invalid', name:'Nora Ny', publicTitle:'Nestleder' }] });
    const o = await service.getHandoverOverview('elvebakken');
    expect(o.handover).toMatchObject({ id, status:'awaiting_acceptance' });
    expect(o.handover?.invites.map(i=>i.status)).toEqual(['pending','pending']);
    expect(service.notifications.some(n=>n.userId===sivert && n.type==='handover.invited')).toBe(true);
    await expect(service.startHandover({ organizationId:'elvebakken', handoverOn:inDays(12), oldBoardEndsOn:inDays(11), activationDate:inDays(12),
      invites:[{ userId:sivert, adminRole:'school_admin' }] })).rejects.toThrow('allerede en styreoverføring');
    // Uten godtatt etterfølger kan den ikke aktiveres, men den kan avlyses.
    await expect(service.activateHandoverNow(id)).rejects.toThrow('Minst én ny skoleadministrator');
    await service.cancelHandover(id);
    expect((await service.getHandoverOverview('elvebakken')).handover?.status).toBe('cancelled');
  });
  it('avviser elever ved andre skoler og datoer i feil rekkefølge',async()=>{
    await expect(service.startHandover({ organizationId:'elvebakken', handoverOn:inDays(12), oldBoardEndsOn:inDays(13), activationDate:inDays(12),
      invites:[{ userId:'user-ida', adminRole:'school_admin' }] })).rejects.toThrow('senest den dagen');
    const kuben = (await service.searchAssignablePeople({ organizationId:'kuben', query:'Emil' }))[0];
    if (kuben) await expect(service.startHandover({ organizationId:'elvebakken', handoverOn:inDays(12), oldBoardEndsOn:inDays(11), activationDate:inDays(12),
      invites:[{ userId:kuben.id, adminRole:'school_admin' }] })).rejects.toThrow('går ikke på denne skolen');
  });
  it('endrer datoen for styreskiftet',async()=>{
    await service.setElectionDate({ organizationId:'elvebakken', date:inDays(40) });
    expect((await service.getHandoverOverview('elvebakken')).expectedHandoverOn).toBe(inDays(40));
  });
  it('lar ikke elever uten rettigheter se overføringen',async()=>{
    const anon = new DemoElevradsnettService({ signedIn:false });
    await expect(anon.getHandoverOverview('elvebakken')).rejects.toThrow();
  });
});

describe('Validering av styreoverføring',()=>{
  it('finner samme person valgt to ganger',()=>{
    const result = startHandoverSchema.safeParse({ organizationId:'s', handoverOn:inDays(3), oldBoardEndsOn:inDays(3), activationDate:inDays(3),
      invites:[{ userId:'u1', adminRole:'school_admin' },{ userId:'u1', publicTitle:'Leder' }] });
    expect(result.success).toBe(false);
  });
  it('krever enten person eller e-post, og et verv eller en rettighet',()=>{
    expect(startHandoverSchema.safeParse({ organizationId:'s', handoverOn:inDays(3), oldBoardEndsOn:inDays(3), activationDate:inDays(3),
      invites:[{ userId:'u1', email:'a@b.no', adminRole:'school_admin' }] }).success).toBe(false);
    expect(startHandoverSchema.safeParse({ organizationId:'s', handoverOn:inDays(3), oldBoardEndsOn:inDays(3), activationDate:inDays(3),
      invites:[{ userId:'u1', adminRole:'school_admin' },{ userId:'u2' }] }).success).toBe(false);
  });
});

describe('Supabase: varsler og overføring',()=>{
  function fake(rpcs:Record<string,unknown>) {
    const calls:{ name:string; args:unknown }[] = [];
    const client = {
      auth:{ getSession:async()=>({ data:{ session:{ user:{ id:'u1' } } } }) },
      rpc:async(name:string,args?:unknown)=>{ calls.push({ name,args }); const v = rpcs[name]; return v instanceof Error?{ data:null, error:{ message:v.message } }:{ data:v ?? null, error:null }; },
    };
    return { service:new SupabaseElevradsnettService(client as unknown as SupabaseClient), calls };
  }
  it('gjør om varslene fra databasen',async()=>{
    const { service } = fake({ list_notifications:[{ id:'n1', type:'message.new', category:'messages', title:'Ny melding fra Ida', body:null, link:'#/meldinger', item_count:3, read_at:null, created_at:'2026-10-01T10:00:00Z' }] });
    expect(await service.listNotifications()).toEqual([{ id:'n1', type:'message.new', category:'messages', title:'Ny melding fra Ida', body:undefined, link:'#/meldinger', count:3, read:false, createdAt:'2026-10-01T10:00:00Z' }]);
  });
  it('sender invitasjonene i formatet start_handover forventer',async()=>{
    const { service,calls } = fake({ start_handover:'h1' });
    expect(await service.startHandover({ organizationId:'s1', handoverOn:inDays(5), oldBoardEndsOn:inDays(4), activationDate:inDays(5),
      invites:[{ userId:'u2', publicTitle:'Leder', adminRole:'school_admin' },{ email:'Ny@Example.invalid', name:'Nora', publicTitle:'Nestleder' }] })).toBe('h1');
    expect(calls[0]).toMatchObject({ name:'start_handover', args:{ p_org:'s1', p_activation_date:inDays(5), p_invites:[
      { user_id:'u2', email:null, name:null, public_title:'Leder', admin_role:'school_admin' },
      { user_id:null, email:'ny@example.invalid', name:'Nora', public_title:'Nestleder', admin_role:null }] } });
  });
  it('oversetter feil fra overføringen til norsk',async()=>{
    const { service } = fake({ start_handover:new Error('recovery not allowed') });
    await expect(service.startHandover({ organizationId:'s1', handoverOn:inDays(5), oldBoardEndsOn:inDays(4), activationDate:inDays(5),
      invites:[{ userId:'u2', adminRole:'school_admin' }], recoveryReason:'Valget er holdt' })).rejects.toThrow('sju dager forsinket');
  });
  it('gjør om oversikten',async()=>{
    const { service } = fake({ get_handover_overview:{ organization_id:'s1', name:'Skolen', expected_handover_on:'2026-10-20', term_starts_on:null, overdue_days:0, admin_count:1,
      can_manage:true, can_recover:false, members:[{ user_id:'u1', name:'Ida', offices:['Leder'], roles:['school_admin'] }],
      handover:{ id:'h1', status:'scheduled', activation_date:'2026-10-20', old_board_ends_on:'2026-10-19', is_recovery:false, recovery_reason:null, started_by_name:'Ida', created_at:'x', completed_at:null,
        invites:[{ id:'i1', user_id:null, name:null, email:'ny@example.invalid', public_title:'Nestleder', admin_role:null, status:'pending', responded_at:null }] } } });
    const o = await service.getHandoverOverview('s1');
    expect(o.members[0]).toEqual({ userId:'u1', name:'Ida', offices:['Leder'], roles:['school_admin'] });
    expect(o.handover?.invites[0]).toMatchObject({ name:'ny@example.invalid', email:'ny@example.invalid', status:'pending' });
  });
});

describe('E-post: daglig sammendrag og invitasjoner',()=>{
  it('lager ett sammendrag med lenker inn i appen, uten HTML fra varslene',()=>{
    const mail = buildDigestEmail({ to:'ida@example.invalid', name:'Ida', appUrl:'https://app.test/elevradsnett/', items:[
      { title:'Ny melding fra <b>Sivert</b>', link:'#/meldinger', count:3 },
      { title:'Påminnelse', body:'Styreskiftet er om 7 dager.', link:'javascript:alert(1)' },
    ] });
    expect(mail.subject).toBe('Du har 4 nye varsler på Elevrådsnett');
    expect(mail.html).toContain('Ny melding fra &lt;b&gt;Sivert&lt;/b&gt; (3)');
    expect(mail.html).not.toContain('javascript:');
    expect(mail.text).toContain('https://app.test/elevradsnett/#/meldinger');
  });
  it('viser maks et fast antall varsler og nevner resten',()=>{
    const items = Array.from({ length:DIGEST_MAX_ITEMS+3 },(_,i)=>({ title:`Varsel ${i}` }));
    expect(buildDigestEmail({ to:'a@b.no', name:'A', appUrl:'https://x.test/', items }).text).toContain('… og 3 til.');
  });
  it('lager invitasjonen til en ny bruker',()=>{
    const mail = buildInviteEmail({ email:'ny@example.invalid', invited_name:'Nora', organization_name:'Elvebakken vgs', public_title:'Nestleder', admin_role:'school_admin', activation_date:'2026-10-25' },'https://x.test/');
    expect(mail.subject).toBe('Invitasjon til elevrådsstyret i Elvebakken vgs');
    expect(mail.text).toContain('Nestleder og rollen skoleadministrator, fra 25.10.2026');
  });
  it('lenker bare internt',()=>{
    expect(appLink('https://x.test/app','#/varsler')).toBe('https://x.test/app/#/varsler');
    expect(appLink('https://x.test/app/','https://evil.test')).toBe('https://x.test/app/');
  });
});
