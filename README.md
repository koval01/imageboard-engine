# Kryivka

Анонімний український іміджборд. Один Compose-стек на Mac (OrbStack) і на сервері.

## Швидкий старт (Docker / OrbStack)

```bash
cp .env.example .env
# змініть JWT_SECRET, S3_SECRET_KEY, ADMIN_BOOTSTRAP_KEY
docker compose up --build
```

Відкрийте http://localhost:8080

Дані Postgres і Silo лежать у `./data/postgres` та `./data/silo` (bind-mount). `docker compose down` їх **не** видаляє. Ніколи не запускайте `docker compose down -v`.

### Міграція на інший сервер

```bash
docker compose stop
rsync -a data/ .env compose.yml docker/ user@new-host:~/kryivka/
# на новому хості:
docker compose up -d --build
```

За бажанням зробіть логічний дамп: `docker compose exec postgres pg_dump -U kryivka kryivka > backup.sql`

### Cloudflare Tunnel

На Mac і на сервері той самий `compose.yml` з профілем `tunnel`. Ingress (Zero Trust → Networks → Tunnels → kryivka):

| Hostname | Path | Origin |
|----------|------|--------|
| `kryivka.org`, `www.kryivka.org` | `^/api` | `http://api:8082` |
| `kryivka.org`, `www.kryivka.org` | (решта) | `http://frontend:80` |

Фронтенд (nginx) віддає SPA, `/assets/` і `/media/` (Silo). `/api` йде в API напряму, без nginx.

1. Додайте `CLOUDFLARE_TUNNEL_TOKEN` у `.env`.
2. `docker compose --profile tunnel up -d`

Після цього можна прогнати димові e2e проти публічного URL:

```bash
PLAYWRIGHT_BASE_URL=https://kryivka.org E2E_ADMIN_KEY=... npx playwright test e2e/tests/public.spec.ts
```

### Фронтенд на CDN

Зберіть SPA з `VITE_API_ORIGIN=https://kryivka.org`, викладіть `client/dist` на Pages/R2, виставте `CORS_ORIGIN` на API. Nginx у режимі `FRONTEND_MODE=cdn` віддає лише `/api` і `/media`.

## Розробка без Docker (API)

```bash
cd client && npm ci && npm run build
# .env.local з sqlite://sqlite.db і STORAGE_TYPE=local
cargo run
```

## Тести

```bash
cargo test
docker compose -f compose.e2e.yml up --build --abort-on-container-exit --exit-code-from playwright
# скинути ізольовані томи e2e:
docker compose -f compose.e2e.yml down -v
```

E2E використовує окремі Docker-томи Postgres/Silo і **не** чіпає `./data`. Опційний GitHub job: workflow `E2E (optional)`.

Якщо в `.env` є `CLOUDFLARE_TUNNEL_TOKEN`, після `docker compose --profile tunnel up -d` можна прогнати дим проти публічного URL:

```bash
PLAYWRIGHT_BASE_URL=https://kryivka.org npx playwright test e2e/tests/public.spec.ts
# або з compose e2e-образу (лише smoke, без запису в прод):
TUNNEL_SMOKE_URL=https://kryivka.org npx playwright test e2e/tests/tunnel.smoke.spec.ts
```
