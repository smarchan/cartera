import Link from "next/link";

export const metadata = { title: "Privacidad · Cartera" };

export default function Privacidad() {
  return (
    <main className="wrap prose">
      <p><Link href="/" className="muted">← Volver</Link></p>
      <h1>Privacidad</h1>
      <p>Cartera es una herramienta privada para familia y amigos. Esto es lo que guarda y dónde:</p>
      <h2>Qué datos se guardan</h2>
      <ul>
        <li>Tu cuenta: correo electrónico y, si entras con Google, tu nombre y foto de perfil. Los gestiona Clerk.</li>
        <li>Tu cartera: las operaciones que registras (activo, fecha, cantidad, precio, moneda, comisión) y tus ajustes (moneda base, colores). Se guardan en una base de datos Postgres de Neon.</li>
        <li>La web se sirve desde Vercel. Los precios se consultan a Yahoo Finance y al BCE sin enviar ningún dato tuyo.</li>
      </ul>
      <h2>Quién puede verlos</h2>
      <p>Solo tú ves tu cartera. Nadie más con cuenta en Cartera tiene acceso a ella. No se venden ni se comparten datos, y no hay publicidad ni analítica de terceros.</p>
      <h2>Cómo borrarlos</h2>
      <p>Desde el menú ⋯ de la cartera, «Eliminar mi cuenta» borra tus operaciones, tus ajustes y tu cuenta de forma definitiva. Para cualquier duda, escribe al administrador de la app.</p>
    </main>
  );
}
