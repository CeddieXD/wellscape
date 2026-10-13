import { useState } from "react";
import { LockKeyhole, Mail, Waves } from "lucide-react";
import { api } from "./api";
import type { AuthSession } from "./types";

type Props = { onAuthenticated: (session: AuthSession) => void; notice?: string };

export default function AuthScreen({ onAuthenticated, notice }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (mode === "register" && password !== confirmPassword) {
      setError("Those passwords do not match yet.");
      return;
    }
    setSubmitting(true);
    try {
      const session = mode === "register"
        ? await api.register(name, email, password)
        : await api.login(email, password);
      onAuthenticated(session);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn't sign you in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-screen">
      <a className="auth-brand" href="#welcome"><span className="brand-mark"><Waves size={20} /></span>wellscape</a>
      <div className="auth-illustration" aria-hidden="true"><span>☼</span><i /><b /></div>
      <section className="auth-card">
        <span className="eyebrow">A LITTLE SPACE FOR YOU</span>
        <h1>{mode === "login" ? "Welcome back." : "Join us!"}</h1>
        <p>{mode === "login" ? "Pick up where your wellness journey and little world left off." : "Create an account and start your wellness journey with the Wellscape community."}</p>
        {notice && <p className="auth-notice" role="status">{notice}</p>}
        <form onSubmit={submit} className="auth-form">
          {mode === "register" && <label>Your name<input autoComplete="name" required maxLength={40} value={name} onChange={(event) => setName(event.target.value)} placeholder="What should we call you?" /></label>}
          <label>Email address<span className="auth-input"><Mail size={16} /><input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></span></label>
          <label>Password<span className="auth-input"><LockKeyhole size={16} /><input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></span></label>
          {mode === "register" && <label>Confirm password<span className="auth-input"><LockKeyhole size={16} /><input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Type your password again" /></span></label>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="primary-button auth-submit" disabled={submitting}>{submitting ? "One moment..." : mode === "login" ? "Log in" : "Create my account"} <span>→</span></button>
        </form>
        <p className="auth-switch">{mode === "login" ? "New to Wellscape?" : "Already have an account?"} <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}> {mode === "login" ? "Sign up" : "Log in"}</button></p>
      </section>
      <p className="auth-whisper">Small steps. Big changes.</p>
    </main>
  );
}
