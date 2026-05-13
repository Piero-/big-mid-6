# BIG 6 / MID 6 Live Scoring

Aplicacion en espanol para operar dos torneos de golf con:

- Vista publica sin login
- Login por usuario/password para Admin y Equipo
- Captura de gross score por hoyo
- Clasificacion en vivo con polling cada 20 segundos
- Cierre/reapertura de torneo
- Auditoria de cambios
- Exportacion CSV e impresion/PDF desde el panel admin

## Stack

- Frontend: React + Vite
- Backend: ASP.NET Core 8 Web API
- ORM: Entity Framework Core
- Base local: SQLite
- Produccion: PostgreSQL via `DATABASE_URL`
- Autenticacion: JWT HS256 generado por el backend

## Credenciales seed

- Admin: `admin` / `admin2026`
- Equipos: usernames tipo `bigequipo1`, `midequipo1`
- Password inicial de equipos: `equipo2026`

## Rutas principales

- `/`
- `/leaderboard`
- `/leaderboard/big-6`
- `/leaderboard/mid-6`
- `/equipo/login`
- `/equipo/marcador`
- `/equipo/leaderboard`
- `/admin/login`
- `/admin/torneos`
- `/admin/equipos`
- `/admin/usuarios`
- `/admin/resultados`

## Desarrollo local

Backend:

```powershell
dotnet run --project server/TourVirtual.Api --urls http://localhost:5000
```

Frontend:

```powershell
cd ClientApp
npm.cmd run dev
```

Abre:

```text
http://localhost:5173
```

## Produccion local en un servidor

```powershell
cd ClientApp
npm.cmd run build:server
dotnet run --project ..\server\TourVirtual.Api
```

## Variables utiles

```text
DATABASE_URL=postgres://...
ALLOWED_ORIGINS=https://tu-frontend.vercel.app,http://localhost:5173
JWT_SECRET=usa-un-secreto-largo
```

## API destacada

- `POST /api/auth/login`
- `GET /api/tournaments`
- `GET /api/tournaments/{slug}`
- `GET /api/leaderboards/{slug}`
- `PUT /api/teams/{teamId}/scores/{holeNumber}`
- `POST /api/admin/tournaments/{slug}/status`
- `GET /api/admin/audit/{slug}`
- `POST /api/admin/teams`
- `PUT /api/admin/teams/{teamId}`
- `DELETE /api/admin/teams/{teamId}`
- `POST /api/admin/users/reset-password`
