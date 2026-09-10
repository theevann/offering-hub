DEV_COMPOSE = docker compose -p coie -f docker-compose.yml -f docker-compose.dev.yml
PROD_COMPOSE = docker compose -p coie-prod -f docker-compose.yml -f docker-compose.prod.yml

# Start PostgreSQL; run application code locally
db:
	$(DEV_COMPOSE) up -d db

# Run the database, API, and bot in Docker
dev-containers:
	$(DEV_COMPOSE) up -d

# Rebuild production images, including the current migration files
prod:
	$(PROD_COMPOSE) up -d --build

# Unqualified commands target development for compatibility
down: dev-down
logs: dev-logs
clean: dev-clean

dev-down:
	$(DEV_COMPOSE) down --remove-orphans

prod-down:
	$(PROD_COMPOSE) down --remove-orphans

dev-logs:
	$(DEV_COMPOSE) logs -f

prod-logs:
	$(PROD_COMPOSE) logs -f

# Delete only the selected project's containers and named volumes.
# Bind-mounted media directories are retained.
dev-clean:
	$(DEV_COMPOSE) down -v --remove-orphans

prod-clean:
	$(PROD_COMPOSE) down -v --remove-orphans

dev-reset-db:
	$(DEV_COMPOSE) up -d --wait db
	cd api && npm run db:rebuild-migration
	cd api && npx prisma migrate reset -f
	cd api && npx prisma generate
	$(DEV_COMPOSE) up -d
	$(DEV_COMPOSE) restart api

prod-reset-db:
	$(PROD_COMPOSE) down --remove-orphans
	docker volume rm coie-prod_postgres_data
	$(PROD_COMPOSE) up -d --build