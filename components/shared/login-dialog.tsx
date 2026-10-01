import { LoginFlow } from '@/components/shared/login-flow';
import { Logo, Modal } from '@/components/shared/ui';
import type { Organization, Session } from '@/lib/domain/types';

/** Innlogging over siden brukeren er på. Etter innlogging fortsetter appen med handlingen brukeren prøvde på. */
export function LoginDialog({open,reason,schools,onClose,onDone}:{open:boolean;reason?:string;schools:Organization[];onClose:()=>void;onDone:(session:Session)=>void}) {
  return <Modal open={open} onClose={onClose} labelledBy="login-dialog-title" width={520}>
    <div className="modal-head"><Logo/><button className="close-btn" aria-label="Lukk" onClick={onClose}>×</button></div>
    <div className="modal-body login-modal-body">
      <LoginFlow schools={schools} reason={reason} onDone={onDone} headingLevel={2} headingId="login-dialog-title"/>
    </div>
  </Modal>;
}

/** Vises i stedet for sider som krever innlogging. Siden lastes når brukeren har logget inn. */
export function LoginGate({title,text,schools,onDone}:{title:string;text:string;schools:Organization[];onDone:(session:Session)=>void}) {
  return <div className="page narrow">
    <div><h1>{title}</h1><p className="muted" style={{ marginTop:6 }}>{text}</p></div>
    <LoginFlow schools={schools} reason="Skriv inn e-posten din, så sender vi deg en engangskode." onDone={onDone} headingLevel={2}/>
  </div>;
}
