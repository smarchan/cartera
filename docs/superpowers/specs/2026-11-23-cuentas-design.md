# Cuentas de usuario y cartera en la nube — diseño

Fecha: 2026-11-23 · Estado: pendiente de aprobación

## Intención

La app hoy guarda la cartera en el navegador de cada persona. Samuel quiere que familia y amigos la usen, cada uno con su propia cuenta (correo o Google) y su propia cartera, disponible en cualquier dispositivo. Los precios siguen funcionando igual que ahora (compartidos, refresco cada 30 s).

## Objetivos

- Registro e inicio de sesión con correo o con cuenta de Google.
- Cada usuario ve y edita solo sus operaciones y ajustes (moneda base, color en +/−), guardados en base de datos.
- La misma cartera en móvil y ordenador.
- Al entrar por primera vez, si el navegador tiene una cartera local (no la de ejemplo), ofrecer importarla a la cuenta.
- Poder borrar la cuenta y todos sus datos desde la app.

## No objetivos

- Compartir carteras entre usuarios, panel de administración, pagos.
- Aparecer en Google: se marca `noindex` y `robots.txt` lo bloquea.
- Cambiar la fuente de precios o la lógica de cálculo.

## Anti-objetivos (sería un fracaso aunque funcione)

- Que un usuario pueda leer o modificar datos de otro.
- Perder la cartera que alguien ya tiene en su navegador.
- Romper los precios en tiempo real o la API existente.

## Restricciones

- Hosting: Vercel Hobby (uso no comercial).
- **Clerk en modo producción exige un dominio propio**; en `*.vercel.app` solo funciona su modo desarrollo: aviso de “Development mode”, la pantalla de Google muestra un dominio `*.accounts.dev` y límites de usuarios más bajos que producción.
- RGPD básico: aviso de privacidad breve y borrado de cuenta con sus datos.
- Yahoo Finance no oficial: válido a escala de un grupo pequeño.

## Enfoques considerados

| Enfoque | A favor | En contra |
|---|---|---|
| **A. Clerk + Neon Postgres (elegido)** | Pantallas de login hechas, Google con un interruptor, ambos se instalan desde el Marketplace de Vercel con variables de entorno automáticas | Dos servicios; Clerk producción necesita dominio propio |
| B. Supabase (auth + BD) | Un solo proveedor, reglas por fila | El plan gratuito pausa proyectos inactivos |
| C. Firebase | Plataforma de Google | Reescribir la capa de datos y repartir la app entre Vercel y Google |

Samuel eligió A.

## Diseño

### Autenticación (Clerk)
- `@clerk/nextjs` con `clerkMiddleware`. Todas las rutas de la app y todas las `/api/*` exigen sesión (así la API de precios no queda abierta a cualquiera).
- Páginas `/sign-in` y `/sign-up` con los componentes de Clerk, en tema oscuro acorde a la app.
- Métodos: correo (código por email) y Google.
- `UserButton` en la cabecera (perfil, cerrar sesión).

### Datos (Neon Postgres)
- Cliente `@neondatabase/serverless` con SQL directo, sin ORM.
- Tablas:
  - `transactions(id text pk, user_id text not null, symbol, name, type check in ('buy','sell'), date date, quantity numeric, price numeric, currency char(3), fees numeric default 0, fx numeric null, fx_base char(3) null, note text null, created_at, updated_at)`, índice en `user_id`.
  - `settings(user_id text pk, base char(3) default 'EUR', color_pnl boolean default false, updated_at)`.
- Migración SQL versionada en `db/migrations/001_init.sql`, aplicada con un script `npm run db:migrate`.

### API (todas leen `userId` de la sesión de Clerk, nunca del cliente)
- `GET /api/portfolio` → `{ txs, settings }`.
- `PUT /api/portfolio/tx` → crea o actualiza una operación (valida campos en servidor; `WHERE user_id = $userId` en toda escritura).
- `DELETE /api/portfolio/tx?id=` → borra una operación propia.
- `PUT /api/portfolio/settings`.
- `POST /api/portfolio/import` → alta masiva (importar local / CSV), modo añadir o reemplazar, en una transacción.
- `DELETE /api/account` → borra filas del usuario y luego el usuario en Clerk.

### Cliente
- `usePortfolio` pasa de `localStorage` a la API con actualizaciones optimistas y reversión si falla.
- Cuenta nueva vacía: estado vacío con «Nueva operación» e «Importar CSV» (la cartera de ejemplo deja de mostrarse a usuarios con sesión).
- Si hay cartera local no de ejemplo y la de la cuenta está vacía: aviso «Importar la cartera guardada en este navegador».
- Menú ⋯: añadir «Eliminar mi cuenta» con confirmación.

### Privacidad
- Página `/privacidad` breve: qué se guarda (correo, operaciones), dónde (Clerk, Neon, Vercel), cómo borrarlo.

## Pasos que necesitan a Samuel
- Instalar Clerk y Neon desde el Marketplace de Vercel (aceptar términos con su cuenta).
- Si hay dominio propio: añadirlo en Vercel y los registros DNS que pida Clerk.

## Decisiones abiertas (de Samuel)
1. Dominio: modo desarrollo de Clerk en `vercel.app` ahora, o dominio propio para modo producción.
2. Registro abierto a quien tenga el enlace, o solo correos en una lista de invitados.

## Decisiones del constructor
- SQL directo en lugar de ORM; cantidades `numeric` y conversión a `number` en el servidor.
- Tests: mantener los del motor y añadir tests de validación de la API y de aislamiento por usuario (consultas siempre filtradas por `user_id`).
