import { useApp } from '@/components/app-context';
import { LoginFlow } from '@/components/shared/login-flow';
import type { Session } from '@/lib/domain/types';

/** Egen side for innlogging (#/logg-inn). Etter innlogging sendes brukeren tilbake dit de kom fra. */
export function LoginView({onDone}:{onDone:(session:Session)=>void}) {
  const { session, currentUser, organizations, go, signOut } = useApp();
  if (session.status!=='anonymous') return <div className="page narrow">
    <div className="card">
      <h1>Du er logget inn</h1>
      <p className="muted">{currentUser?`Logget inn som ${currentUser.name} (${currentUser.email}).`:'Du er logget inn.'}</p>
      <div className="actions"><button className="btn primary large" onClick={()=>go({ view:'feed' })}>Til forsiden</button><button className="btn large" onClick={signOut}>Logg ut</button></div>
    </div>
  </div>;
  return <div className="page narrow">
    <LoginFlow schools={organizations} onDone={onDone}/>
  </div>;
}
