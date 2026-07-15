import { useState, type FormEvent } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import type { LocalUser } from "../domain/models";
import type { OfflinePosApplication } from "../services/offline-app";

export function AuthScreen({ app, requiresSetup, onAuthenticated }: { app: OfflinePosApplication; requiresSetup: boolean; onAuthenticated: (user: LocalUser) => void }) {
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("WholesalePOS Store");
  const [login, setLogin] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const user = requiresSetup
        ? await app.auth.setupOwner({ name, login, secret, businessName })
        : await app.auth.login(login, secret);
      onAuthenticated(user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand-mark"><ShieldCheck size={28} /></div>
        <p className="eyebrow">WholesalePOS</p>
        <h1>{requiresSetup ? "Set up this tablet" : "Unlock this tablet"}</h1>
        <p className="muted">All operational data stays on this Android device.</p>
        <form onSubmit={submit} className="form-stack">
          {requiresSetup ? <label>Owner name<input value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" /></label> : null}
          {requiresSetup ? <label>Business name<input value={businessName} onChange={(event) => setBusinessName(event.target.value)} required /></label> : null}
          <label>Login<input value={login} onChange={(event) => setLogin(event.target.value)} required autoCapitalize="none" autoComplete="username" /></label>
          <label>PIN or password<input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} minLength={4} required autoComplete={requiresSetup ? "new-password" : "current-password"} inputMode={requiresSetup ? "text" : "numeric"} /></label>
          {error ? <p className="error-banner">{error}</p> : null}
          <button className="button primary wide" disabled={submitting}><LockKeyhole size={18} /> {submitting ? "Please wait" : requiresSetup ? "Create offline store" : "Unlock"}</button>
        </form>
      </section>
    </main>
  );
}

