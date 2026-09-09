# Start PostgreSQL; run application code locally
db:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db

# Run the database, API, and bot in Docker
dev-containers:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
# 	docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d

# Start production environment
prod:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Stop all services
down:
	docker compose -f docker-compose.yml down

# View logs
logs:
	docker compose -f docker-compose.yml logs -f

# Clean up containers and volumes
clean:
	docker compose -f docker-compose.yml down -v --remove-orphans