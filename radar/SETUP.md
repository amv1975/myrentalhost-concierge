# Puesta en marcha

Nada de esto arranca sin provisionar Supabase y Google Cloud. Son unos 20
minutos la primera vez.

## 0. Mover Radar a su propio repositorio

Ahora mismo Radar vive en `radar/` dentro de `myrentalhost-concierge`, porque la
sesión que lo construyó no tenía permiso para crear repositorios. Para separarlo:

```bash
# Crea amv1975/radar en GitHub (privado, vacío, sin README).
cd radar
git init
git add -A
git commit -m "Radar: primera versión"
git branch -M main
git remote add origin git@github.com:amv1975/radar.git
git push -u origin main
```

A partir de ahí Vercel apunta a `amv1975/radar` con el directorio raíz por
defecto. Si prefieres dejarlo donde está, en Vercel configura
**Root Directory: `radar`** y todo lo demás funciona igual.

## 1. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com). Región: Europa.
2. De **Project Settings → API** copia:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (esta no lleva nunca el
     prefijo `NEXT_PUBLIC_`: salta RLS)
3. En **SQL Editor**, pega y ejecuta primero
   `supabase/migrations/0001_init.sql` y después `supabase/seed.sql`.

El seed te da de alta a ti en los dos espacios y a Victoria solo en Familia. Si
alguno de los dos ya se había registrado, el trigger le concede el acceso sin
que tenga que volver a entrar.

## 2. Google Cloud

1. Crea un proyecto en [console.cloud.google.com](https://console.cloud.google.com).
2. **APIs y servicios → Biblioteca**: habilita **Gmail API** y
   **Google Calendar API**.
3. **Pantalla de consentimiento OAuth**: tipo Externo, en modo *Testing*. Añade
   como usuarios de prueba `agustinvillafanie@gmail.com` y
   `victoria.williams1@gmail.com`.
   En modo Testing el consentimiento caduca cada 7 días y hay que volver a
   entrar; para uso continuado, publica la app (con scopes sensibles Google pide
   verificación, pero para uso propio con pocos usuarios basta con aceptar el
   aviso).
4. **Credenciales → Crear credenciales → ID de cliente de OAuth**, tipo
   *Aplicación web*. En URI de redirección autorizados pon exactamente:
   ```
   https://<tu-proyecto>.supabase.co/auth/v1/callback
   ```
5. Copia el Client ID y el Client Secret.

### Conectar Google con Supabase

En Supabase, **Authentication → Providers → Google**: activa el proveedor, pega
Client ID y Secret, y en **Additional Scopes** pon exactamente:

```
https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events
```

En **Authentication → URL Configuration**, Site URL apuntando a tu despliegue
(en local, `http://localhost:3000`), y añade la URL de Vercel a las Redirect
URLs cuando despliegues.

Solo esos dos permisos: Gmail en lectura y Calendar para crear eventos. Radar no
puede enviar correo, ni responder, ni borrar nada, y
`tests/permissions.test.ts` falla si alguien amplía la lista.

## 3. Variables de entorno

Copia `.env.example` a `.env.local` y rellena. `CRON_SECRET` es cualquier cadena
larga al azar (`openssl rand -hex 32`).

## 4. Arrancar

```bash
npm install
npm run dev
```

Entra en `http://localhost:3000`, inicia sesión con Google y acepta los
permisos. **Es importante que aceptes en la primera pantalla**: el refresh token
solo llega en ese consentimiento, y sin él el cron no puede leer el buzón
cuando no tienes el navegador abierto. Si te lo saltas, entra de nuevo.

## 5. Comprobar que funciona

1. `Actualizar` en cualquiera de los dos espacios.
2. Ve a **Ver correos**: ahí está lo que ha entrado, en crudo. Si aparece ruido,
   el problema son los remitentes: quítalos en **Ajustes**.
3. Vuelve atrás y revisa los compromisos extraídos contra los correos originales.
   Merece la pena mirar dos cosas: que un boletín informativo haya generado cero
   ítems, y que una fecha relativa ("el próximo miércoles") se haya resuelto
   contra la fecha del correo y no contra hoy.
4. Pulsa `Actualizar` varias veces seguidas: el número de ítems no debe cambiar.

## 6. Tests

```bash
npm run test
```

Los tests de lógica pura corren solos. Los de esquema (idempotencia y
separación de espacios) necesitan un Postgres:

```bash
docker run --rm -d -p 5432:5432 \
  -e POSTGRES_USER=radar -e POSTGRES_PASSWORD=radar -e POSTGRES_DB=radar_test \
  --name radar-pg postgres:16
```

Aplican `0001_init.sql` de verdad, así que si la migración se rompe, se rompen.

## 7. Desplegar

1. Importa el repositorio en Vercel.
2. Añade todas las variables de `.env.example` en Environment Variables.
3. Despliega y añade la URL a las Redirect URLs de Supabase.

### El cron

El plan Hobby de Vercel no ejecuta cada hora (aproximadamente una vez al día).
Por eso la ingesta está también en `.github/workflows/cron.yml`, que llama al
mismo endpoint. En el repositorio, **Settings → Secrets → Actions**, añade:

- `CRON_SECRET`: el mismo valor que en Vercel.
- `RADAR_URL`: la URL del despliegue, sin barra final.

Con Vercel Pro puedes usar `vercel.json` en su lugar y desactivar el workflow.

## Lo que falta

Los pasos 5 y 6 del plan original: la sincronización con Google Calendar y el
despliegue. Hasta que eso esté, **Radar no escribe nada fuera de su propia base
de datos**: confirmar un evento lo marca como confirmado, pero todavía no crea
nada en tu calendario. Es deliberado — primero conviene ver si la extracción es
buena sobre correos reales.

El esquema ya guarda `google_event_id` y `google_calendar_id`, y las
actualizaciones llegan como `needs_review` con el diff, así que cuando se
conecte Calendar la actualización de un evento existente es un PATCH sobre ese
identificador, no un evento nuevo.
