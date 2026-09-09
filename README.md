# COIE Offerings

WhatsApp message ingestion and event discovery platform.

Many places in the world use WhatsApp groups to announce events and offerings. This platform captures those messages, parses them into structured data, and provides a searchable dashboard.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   WhatsApp  │────▶│     Bot     │────▶│     API     │
│   Groups    │     │ (whatsapp-  │     │  (Express)  │
│             │     │   web.js)   │     │             │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  PostgreSQL │
                                        │  + PostGIS  │
                                        │   (Prisma)  │
                                        └─────────────┘
                                               │
                                               ▼
                                         ┌─────────────┐
                                         │   Frontend  │
                                         │   (Nuxt)    │
                                         └─────────────┘
```

**Flow:**
1. Bot listens to WhatsApp messages in configured groups
2. Bot sends raw message data to API via `POST /ingest`
3. API stores raw message, calls LLM parser, geocodes location, stores structured offering
4. Frontend displays searchable/filterable list, calendar, and map views

## Quick Start

## Dev

### Local Development

```bash
# If you are resetting from the old plain-Postgres setup
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v

# Start database only
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db

# Run API locally
cd api
npm install
npx prisma migrate deploy
npx prisma generate
npm run dev

# Run Bot locally (requires WhatsApp QR scan)
cd bot
npm install
npm run dev

# Run Web locally
cd web
npm install
npm run dev
```

### Database Management

```bash
# Access PostgreSQL
docker exec -it offerings_db psql -U offerings_user -d offerings_db

# Verify PostGIS
docker exec -it offerings_db psql -U offerings_user -d offerings_db -c "SELECT PostGIS_Version();"

# Prisma migrations
cd api
npx prisma migrate dev --name descriptive_change
npx prisma studio  # GUI to view data
```

The initial migration creates `postgis`, adds `geography(Point, 4326)` columns to `Group`, `Venue`, and `Offering`, and keeps scalar `latitude` / `longitude` fields for Prisma compatibility.