// E-posttekstene for det daglige sammendraget og invitasjoner til styreoverføring (§5).
// Rene funksjoner uten Deno- eller nettverkskall, så de kan testes med vitest (tests/digest.test.ts).

export type DigestItem = { title:string; body?:string|null; link?:string|null; count?:number; created_at?:string };
export type InviteEmail = { email:string; invited_name?:string|null; organization_name:string; public_title?:string|null; admin_role?:string|null; activation_date:string };
export type Email = { to:string; subject:string; text:string; html:string };

const roleNames:Record<string,string> = { school_admin:'skoleadministrator', content_manager:'innholdsansvarlig' };
/** Hvor mange varsler som vises i én e-post. Resten nevnes med antall. */
export const DIGEST_MAX_ITEMS = 20;

const escape = (value:string)=>value.replace(/[&<>"']/g,c=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]!);
/** Lenker i varsler er alltid interne (#/…). Alt annet ignoreres, så en e-post aldri peker ut av appen. */
export function appLink(appUrl:string,link?:string|null) {
  const base = appUrl.replace(/#.*$/,'').replace(/\/?$/,'/');
  return link && /^#\/[\w\-/]*$/.test(link) ? base+link : base;
}
const dateText = (iso:string)=>{
  const [y,m,d] = iso.slice(0,10).split('-');
  return `${Number(d)}.${Number(m)}.${y}`;
};
const layout = (heading:string,content:string,footer:string)=>`<!doctype html><html lang="nb"><body style="margin:0;padding:24px;background:#ffffff;font-family:Arial,sans-serif;color:#0a466e">
<div style="max-width:560px;margin:0 auto"><p style="font-weight:bold;color:#ff6340;margin:0 0 16px">Elevrådsnett</p><h1 style="font-size:20px;margin:0 0 16px">${heading}</h1>${content}
<p style="font-size:12px;color:#85a2b7;margin-top:24px">${footer}</p></div></body></html>`;

/** Ett sammendrag med alle uleste varsler. Meldingsinnhold er aldri med; varslene sier bare at det er nye meldinger. */
export function buildDigestEmail(input:{ to:string; name:string; items:DigestItem[]; appUrl:string }):Email {
  const items = input.items.slice(0,DIGEST_MAX_ITEMS);
  const rest = input.items.length-items.length;
  const total = input.items.reduce((n,i)=>n+(i.count && i.count>1?i.count:1),0);
  const subject = total===1?'Du har ett nytt varsel på Elevrådsnett':`Du har ${total} nye varsler på Elevrådsnett`;
  const line = (i:DigestItem)=>`${i.title}${i.count && i.count>1?` (${i.count})`:''}`;
  const text = [`Hei, ${input.name}!`,'',...items.flatMap(i=>[`• ${line(i)}`,...(i.body?[`  ${i.body}`]:[]),`  ${appLink(input.appUrl,i.link)}`]),
    ...(rest>0?['',`… og ${rest} til.`]:[]),'',`Se alle varslene: ${appLink(input.appUrl,'#/varsler')}`,'',
    'Du får denne e-posten én gang om dagen når du har uleste varsler. Du kan slå den av under Varsler → Innstillinger.'].join('\n');
  const html = layout(`Hei, ${escape(input.name)}!`,
    `<ul style="padding:0;list-style:none;margin:0">${items.map(i=>`<li style="border-top:1px solid #cedae2;padding:12px 0"><a href="${escape(appLink(input.appUrl,i.link))}" style="color:#0a466e;font-weight:bold;text-decoration:none">${escape(line(i))}</a>${i.body?`<br><span style="color:#0a466e">${escape(i.body)}</span>`:''}</li>`).join('')}</ul>`
    +(rest>0?`<p>… og ${rest} til.</p>`:'')
    +`<p><a href="${escape(appLink(input.appUrl,'#/varsler'))}" style="display:inline-block;background:#ff6340;color:#ffffff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Se alle varslene</a></p>`,
    'Du får denne e-posten én gang om dagen når du har uleste varsler. Du kan slå den av under Varsler → Innstillinger.');
  return { to:input.to, subject, text, html };
}

/** Invitasjon til en e-postadresse som ikke har profil ennå. Personen logger inn med adressen og godtar i appen. */
export function buildInviteEmail(invite:InviteEmail,appUrl:string):Email {
  const what = [invite.public_title,invite.admin_role?`rollen ${roleNames[invite.admin_role] ?? invite.admin_role}`:null].filter(Boolean).join(' og ');
  const greeting = invite.invited_name?`Hei, ${invite.invited_name}!`:'Hei!';
  const intro = `${invite.organization_name} har invitert deg inn i det nye elevrådsstyret som ${what}, fra ${dateText(invite.activation_date)}.`;
  const how = `Logg inn på Elevrådsnett med denne e-postadressen (${invite.email}), velg ${invite.organization_name} som skole og godta invitasjonen under Varsler.`;
  const link = appLink(appUrl,'#/varsler');
  return {
    to:invite.email,
    subject:`Invitasjon til elevrådsstyret i ${invite.organization_name}`,
    text:[greeting,'',intro,'',how,'',link,'','Kjenner du ikke til dette, kan du se bort fra e-posten.'].join('\n'),
    html:layout(escape(greeting),`<p>${escape(intro)}</p><p>${escape(how)}</p><p><a href="${escape(link)}" style="display:inline-block;background:#ff6340;color:#ffffff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Åpne Elevrådsnett</a></p>`,
      'Kjenner du ikke til dette, kan du se bort fra e-posten.'),
  };
}
