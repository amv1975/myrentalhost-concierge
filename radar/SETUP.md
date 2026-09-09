# Puesta en marcha

Nada de esto arranca sin provisionar Supabase y Google Cloud. Son unos 20
minutos la primera vez.

El repositorio es privado a propósito: `supabase/seed.sql` lleva correos
personales y los dominios del colegio.

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

### Este despliegue

- App: https://radar-sigma-five.vercel.app
- Supabase: `evfrkkfjuypxakdhecpa` (West EU, Ireland)
- Google Cloud: proyecto `radarapp-508118`

Tras el primer despliegue hay que registrar la URL en dos sitios, o el login
entra en bucle:

- **Supabase** → Authentication → URL Configuration: Site URL a la URL de
  Vercel, y `https://radar-sigma-five.vercel.app/**` en Redirect URLs.
- **Google Cloud** → Clients → Radar web: la URI de redirección sigue siendo la
  de Supabase (`.../auth/v1/callback`), esa no cambia. Lo que sí conviene es
  añadir la URL de Vercel en *Authorised JavaScript origins*.

### El cron

El plan Hobby de Vercel no ejecuta cada hora (aproximadamente una vez al día).
Por eso la ingesta está también en `.github/workflows/cron.yml`, que llama al
mismo endpoint. En el repositorio, **Settings → Secrets → Actions**, añade:

- `CRON_SECRET`: el mismo valor que en Vercel.
- `RADAR_URL`: la URL del despliegue, sin barra final.

Con Vercel Pro puedes usar `vercel.json` en su lugar y desactivar el workflow.

## Ver la interfaz antes de provisionar nada

```bash
RADAR_PREVIEW=1 npm run dev
```

Y abre `http://localhost:3000/preview`. Son los componentes reales con datos de
ejemplo: no lee ni escribe nada, ni toca el calendario. Sirve para juzgar la
interfaz, no para comprobar que la extracción funciona. Sin `RADAR_PREVIEW=1`
esa ruta no existe.

## Antes de la primera sincronización con el calendario

Radar crea, actualiza y retira eventos en el calendario que indiques
(`primary` por defecto). Conviene saber qué implica antes de confirmar el
primero:

- **Confirmar un evento** lo crea en tu calendario. En Familia se invita
  automáticamente a quien esté en `allowed_members` de ese espacio, así que
  Victoria recibe la invitación.
- **Que el colegio mueva la hora** actualiza el evento existente por su
  `google_event_id`. No aparece uno nuevo.
- **Descartar un evento que ya estaba puesto lo retira del calendario.** Es
  deliberado: si Radar se inventó una reunión, dejarla ahí sería peor que
  quitarla. Es la única operación destructiva de toda la app, solo actúa sobre
  eventos que creó Radar, y nunca toca eventos que hayas creado tú.
- Las **acciones nunca van al calendario**: no tienen hora y el calendario no
  sabe guardarlas. Viven en Radar, que es el motivo de que exista.

Si prefieres estrenar sobre un calendario aparte en vez de sobre el principal,
crea uno en Google Calendar y cambia el destino antes de confirmar nada:

```sql
update spaces set google_calendar_id = '<id-del-calendario>' where key = 'family';
```
