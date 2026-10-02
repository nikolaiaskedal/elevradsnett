import type { SupabaseClient } from '@supabase/supabase-js';
import { NOTIFICATION_CATEGORIES, type AppNotification, type BoardMember, type HandoverInviteStatus, type HandoverOverview, type HandoverRole, type HandoverStatus, type MyHandoverInvite, type NotificationCategory, type NotificationPreferences } from '@/lib/domain/notifications';
import { handoverResponseSchema, idSchema, notificationPreferencesSchema, rescheduleHandoverSchema, setElectionDateSchema, startHandoverSchema } from '@/lib/domain/validation';
import type { Database, Json } from '@/lib/supabase/database.types';
import type { HandoverResponseInput, NotificationPreferencesInput, RescheduleHandoverInput, SetElectionDateInput, StartHandoverInput } from './contracts';
import type { Run } from './supabase-messaging';

type Client = SupabaseClient<Database>;

/** Feilmeldinger fra RPC-ene i 202610120002_varsler_overforing.sql, oversatt til norsk. */
export const varslerServerMessages:Record<string,string> = {
  'invalid preferences':'Innstillingene kunne ikke lagres.',
  'handover already open':'Skolen har allerede en styreoverføring som ikke er fullført. Avlys den først, eller endre datoene.',
  'invalid handover dates':'Sjekk datoene: aktiveringen må være fra i dag, og det gamle styret må slutte senest samme dag.',
  'invalid invites':'Velg det nye styret, og gi hver person et verv eller en rettighet.',
  'school admin required':'Velg minst én ny skoleadministrator.',
  'duplicate invite':'Samme person er valgt to ganger.',
  'invalid email':'Skriv inn en gyldig e-postadresse.',
  'invalid reason':'Skriv en begrunnelse på minst fem tegn.',
  'recovery not allowed':'Gjenoppretting kan startes når overføringen er minst sju dager forsinket, eller skolen mangler skoleadministrator.',
  'invite not found':'Fant ikke invitasjonen.',
  'invite not pending':'Invitasjonen er allerede besvart eller gjelder ikke lenger.',
  'handover not found':'Fant ikke styreoverføringen.',
  'handover not open':'Styreoverføringen er allerede fullført eller avlyst.',
  'handover not ready':'Styreoverføringen kan ikke aktiveres ennå.',
  'accepted successor required':'Minst én ny skoleadministrator må godta invitasjonen før overføringen kan aktiveres.',
};

type OverviewJson = {
  organization_id:string; name:string; expected_handover_on:string|null; term_starts_on:string|null; overdue_days:number; admin_count:number;
  can_manage:boolean; can_recover:boolean;
  members:{ user_id:string; name:string; offices:string[]; roles:HandoverRole[] }[];
  handover:null|{ id:string; status:HandoverStatus; activation_date:string; old_board_ends_on:string; is_recovery:boolean; recovery_reason:string|null; started_by_name:string|null;
    created_at:string; completed_at:string|null;
    invites:{ id:string; user_id:string|null; name:string|null; email:string|null; public_title:string|null; admin_role:HandoverRole|null; status:HandoverInviteStatus; responded_at:string|null }[] };
};
const asCategory = (value:string):NotificationCategory=>(NOTIFICATION_CATEGORIES as readonly string[]).includes(value)?value as NotificationCategory:'other';

/**
 * Varsler og styreoverføring mot Supabase (§5). Alt går via RPC-ene i 202610120002_varsler_overforing.sql,
 * som sjekker rettigheter. Varslene oppdateres i sanntid (notifications er med i supabase_realtime).
 */
export class SupabaseVarsler {
  constructor(private client:Promise<Client>, private run:Run, private userId:()=>Promise<string|null>) {}

  async listNotifications():Promise<AppNotification[]> {
    if (!await this.userId()) return [];
    const rows = await this.run((await this.client).rpc('list_notifications',{ p_limit:50 }),'Kunne ikke hente varslene.');
    return rows.map(r=>({ id:r.id, type:r.type, category:asCategory(r.category), title:r.title, body:r.body ?? undefined, link:r.link ?? undefined,
      count:r.item_count, read:!!r.read_at, createdAt:r.created_at }));
  }
  async markNotificationsRead(ids?:string[]) {
    await this.run((await this.client).rpc('mark_notifications_read',ids?{ p_ids:ids.map(id=>idSchema.parse(id)) }:{}),'Kunne ikke merke varslene som lest.');
  }
  async getNotificationPreferences():Promise<NotificationPreferences> {
    const rows = await this.run((await this.client).rpc('get_notification_preferences'),'Kunne ikke hente innstillingene.');
    const r = rows[0];
    if (!r) throw new Error('Du må logge inn først.');
    return { inApp:r.in_app, email:r.email, inAppOff:(r.in_app_off ?? []).map(asCategory), emailOff:(r.email_off ?? []).map(asCategory) };
  }
  async setNotificationPreferences(input:NotificationPreferencesInput) {
    const p = notificationPreferencesSchema.parse(input);
    await this.run((await this.client).rpc('set_notification_preferences',{ p_in_app:p.inApp, p_email:p.email, p_in_app_off:p.inAppOff, p_email_off:p.emailOff }),'Kunne ikke lagre innstillingene.');
  }
  subscribeToNotifications(listener:()=>void) {
    let stop = ()=>{};
    let closed = false;
    void this.client.then(async client=>{
      const userId = await this.userId();
      if (closed || !userId) return;
      const channel = client.channel(`varsler:${userId}`)
        .on('postgres_changes',{ event:'*', schema:'public', table:'notifications', filter:`user_id=eq.${userId}` },()=>listener())
        .subscribe();
      stop = ()=>{ void client.removeChannel(channel); };
    });
    return ()=>{ closed = true; stop(); };
  }

  async getHandoverOverview(organizationId:string):Promise<HandoverOverview> {
    const raw = await this.run((await this.client).rpc('get_handover_overview',{ p_org:idSchema.parse(organizationId) }),'Kunne ikke hente styreoverføringen.');
    return toOverview(raw as unknown as OverviewJson);
  }
  async setElectionDate(input:SetElectionDateInput) {
    const p = setElectionDateSchema.parse(input);
    await this.run((await this.client).rpc('set_election_date',{ p_org:p.organizationId, p_date:p.date }),'Kunne ikke lagre datoen.');
  }
  async startHandover(input:StartHandoverInput) {
    const p = startHandoverSchema.parse(input);
    const invites = p.invites.map(i=>({ user_id:i.userId ?? null, email:i.email ?? null, name:i.name || null, public_title:i.publicTitle ?? null, admin_role:i.adminRole ?? null }));
    return this.run((await this.client).rpc('start_handover',{ p_org:p.organizationId, p_handover_on:p.handoverOn, p_old_board_ends_on:p.oldBoardEndsOn,
      p_activation_date:p.activationDate, p_invites:invites as unknown as Json, p_recovery_reason:p.recoveryReason }),'Kunne ikke starte styreoverføringen.');
  }
  async rescheduleHandover(input:RescheduleHandoverInput) {
    const p = rescheduleHandoverSchema.parse(input);
    await this.run((await this.client).rpc('reschedule_handover',{ p_handover:p.handoverId, p_activation_date:p.activationDate, p_old_board_ends_on:p.oldBoardEndsOn }),'Kunne ikke endre datoene.');
  }
  async cancelHandover(handoverId:string) {
    await this.run((await this.client).rpc('cancel_handover',{ p_handover:idSchema.parse(handoverId) }),'Kunne ikke avlyse styreoverføringen.');
  }
  async activateHandoverNow(handoverId:string) {
    await this.run((await this.client).rpc('complete_handover',{ p_handover:idSchema.parse(handoverId) }),'Kunne ikke aktivere det nye styret.');
  }
  async listMyHandoverInvites():Promise<MyHandoverInvite[]> {
    if (!await this.userId()) return [];
    const rows = await this.run((await this.client).rpc('list_my_handover_invites'),'Kunne ikke hente invitasjonene.');
    return rows.map(r=>({ id:r.id, organizationId:r.organization_id, organizationName:r.organization_name, publicTitle:r.public_title ?? undefined,
      adminRole:(r.admin_role as HandoverRole|null) ?? undefined, activationDate:r.activation_date, invitedByName:r.invited_by_name ?? '', createdAt:r.created_at, atSchool:!!r.at_school }));
  }
  async respondToHandoverInvite(input:HandoverResponseInput) {
    const p = handoverResponseSchema.parse(input);
    await this.run((await this.client).rpc('respond_handover_invite',{ p_invite:p.inviteId, p_accept:p.accept }),'Kunne ikke svare på invitasjonen.');
  }
}

export function toOverview(o:OverviewJson):HandoverOverview {
  const h = o.handover;
  return {
    organizationId:o.organization_id, name:o.name, expectedHandoverOn:o.expected_handover_on ?? undefined, termStartsOn:o.term_starts_on ?? undefined,
    overdueDays:o.overdue_days, adminCount:o.admin_count, canManage:o.can_manage, canRecover:o.can_recover,
    members:o.members.map(m=>({ userId:m.user_id, name:m.name, offices:m.offices ?? [], roles:m.roles ?? [] }) satisfies BoardMember),
    handover:h?{ id:h.id, status:h.status, activationDate:h.activation_date, oldBoardEndsOn:h.old_board_ends_on, recovery:h.is_recovery, recoveryReason:h.recovery_reason ?? undefined,
      startedByName:h.started_by_name ?? '', createdAt:h.created_at, completedAt:h.completed_at ?? undefined,
      invites:h.invites.map(i=>({ id:i.id, userId:i.user_id ?? undefined, name:i.name ?? i.email ?? '', email:i.email ?? undefined, publicTitle:i.public_title ?? undefined,
        adminRole:i.admin_role ?? undefined, status:i.status, respondedAt:i.responded_at ?? undefined })) }:null,
  };
}
