import Link from "next/link";

export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth">
      <div className="auth-brand">
        <span className="brand-mark" aria-hidden="true" />
        <span>Cartera</span>
      </div>
      <p className="muted auth-lead">Tu cartera de inversión, en tiempo real y en cualquier divisa.</p>
      {children}
      <p className="faint auth-foot">
        <Link href="/privacidad">Privacidad</Link>
      </p>
    </main>
  );
}
