### Development:
2 setups:
- 1. Local development with only DB in docker:
    Run `make db`
    Then run API, Bot, and Web locally with `npm run dev` in each folder.
- 2. Full docker-compose development:
    Run `make dev-containers` to start all DB, API, Bot, and Web in docker-compose.
    You need to check the logs of the bot container to scan the QR code for WhatsApp. You can do this with `docker compose logs -f bot`.

### One-time bot volume permissions setup:

On a new machine, after restoring volumes, or when switching from root to `USER node`, check the bot's mounted directories. The bot runs as UID/GID `1000:1000` and needs write access to `/app/session`, `/app/logs`, and `/data`, including existing files and subdirectories.

- Fresh named volumes (`bot_session`, `bot_logs`) inherit the image directories' ownership when Docker initializes them.
- Existing or restored volumes retain their ownership. Rebuilding the image does not fix their permissions.
- Host bind mounts (`./data` in development, `./data-prod` in production) use host permissions. Ensure UID 1000 has write access to the bot's media directories, especially on Linux. Preserve access needed by other services sharing these directories.

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec --user node bot sh -c '
id
ls -ldn /app/session /app/logs /data
find /app/session /app/logs /data -maxdepth 2 \
  \( ! -readable -o ! -writable \) -print
'
```

If existing session/log files are root-owned, stop the bot and repair those two volumes once. From the project root, for development:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --no-deps --user root bot chown -R node:node /app/session /app/logs
```

For production, replace `docker-compose.dev.yml` with `docker-compose.prod.yml` in all commands. These commands preserve session/log contents and do not change `/data` permissions. Inspect and adjust host data-directory permissions separately if needed; do not recursively change ownership of the entire shared data directory without checking its other users.


### Use of DB during preprod development:
- npm run db:rebuild-migration
- npx prisma migrate reset
- npx prisma generate

### Docker Compose rule for environment variables priorities:

For a variable inside the container, highest priority first:
    1. CLI override: docker compose run -e NAME=value
    2. Service environment: in Compose
    3. Service env_file:
    4. Dockerfile ENV

Two details:
- The project’s root .env supplies ${VARIABLE} substitutions in Compose. It doesn’t automatically put variables inside containers.
- With multiple env_file entries, the later file wins for duplicate variables.

Then, when Node starts `require("dotenv").config();`, the `dotenv` package fills missing variables but preserves existing process.env values, including those supplied by Compose.
Only `dotenv.config({ override: true })` reverses that behavior.


So, for us, there are two steps:
1. Compose starts the container: `environment` field overrides the same variable from `env_file` field.
2. Node calls `dotenv.config()`: dotenv fills missing variables from .env, but doesn’t overwrite existing process.env values by default.

```
.env                  # Database settings used by Compose
api/.env              # API development settings and keys
api/.env.prod         # API production settings and keys
bot/.env              # Bot development settings
bot/.env.prod         # Bot production settings
web/.env              # Web development settings
web/.env.prod         # Web production settings
```

### Our docker compose files:
- docker-compose.yml: our base Compose file, used for both dev and prod.
- docker-compose.dev.yml: development Compose file, used for local development with all services in containers. Loads .env files for API, Bot, and Web.
- docker-compose.prod.yml: production Compose file, used for production deployment with all services in containers. Loads .env.prod files for API, Bot, and Web.

Commands:
- For local development with containers:
```
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```
Add `--build` to rebuild images, or `-d` to detach and run in background.

- For production deployment:
```
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```
