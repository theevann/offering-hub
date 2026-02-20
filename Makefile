# Start development environment
dev:
	docker compose up -d db

# Start development environment containerized
devc:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Start production environment
prod:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up

# Stop all services
down:
	docker compose -f docker-compose.yml down

# View logs
logs:
	docker compose -f docker-compose.yml logs

# Clean up containers and volumes
clean:
	docker compose -f docker-compose.yml down -v --remove-orphans