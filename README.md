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

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f bot
docker-compose logs -f api
docker-compose logs -f web

# Stop all services
docker-compose down
```

## Folder Structure

```
coie/
├── bot/                    # WhatsApp message listener
│   ├── src/
│   │   └── index.js        # Bot entry point
│   ├── logs/               # Daily JSON log files
│   ├── session/            # WhatsApp session data
│   ├── Dockerfile
│   └── package.json
│
├── api/                    # Express API + Prisma
│   ├── prisma/
│   │   └── schema.prisma   # Database schema
│   ├── src/
│   │   ├── index.js        # App entry
│   │   ├── routes/
│   │   │   ├── ingest.js   # POST /ingest (bot → API)
│   │   │   └── offerings.js # GET routes + /nearby (PostGIS)
│   │   ├── services/
│   │   │   ├── ingestionService.js
│   │   │   ├── parsingService.js
│   │   │   └── geocodingService.js
│   │   ├── db/
│   │   │   └── prismaClient.js
│   │   └── utils/
│   │       └── errors.js
│   ├── Dockerfile
│   └── package.json
│
├── web/                    # Nuxt frontend
│   ├── pages/
│   │   ├── calendar.vue    # Calendar view
│   │   ├── list.vue        # List view with filters
│   │   ├── map.vue         # Map view (Mapbox)
│   │   ├── browse/         # Browse by group/tag/location
│   │   ├── offerings/      # Offering detail pages
│   │   └── admin/          # Admin panel (auth required)
│   ├── components/
│   ├── composables/
│   ├── Dockerfile
│   └── package.json
│
├── readmes/                # Detailed implementation guides
│   ├── readme-api.md
│   ├── readme-bot.md
│   ├── readme-db.md
│   └── readme-web.md
│
├── docker-compose.yml
└── Makefile
```

## Tech Stack

| Component  | Technology                             |
| ---------- | -------------------------------------- |
| Bot        | Node.js, whatsapp-web.js, Puppeteer    |
| API        | Node.js, Express, Prisma ORM, Zod      |
| Database   | PostgreSQL + PostGIS                   |
| LLM Parser | OpenAI GPT-4o-mini / Claude Haiku      |
| Geocoding  | Mapbox / Nominatim (switchable)        |
| Frontend   | Nuxt 3, Vue 3, Tailwind CSS, Mapbox GL JS |

## Key Features

### Location-Based Discovery
- Structured location fields: country, region, city
- Geocoded coordinates (latitude, longitude)
- Distance-based search via PostGIS
- Interactive map view

### Flexible Parsing
- LLM extracts structured data from unstructured messages
- Categorizes events: CLASS, WORKSHOP, GATHERING, SERVICE, SALE, OTHER
- Extracts price, date, contact info, tags
- Stores raw LLM output for debugging

### Frontend Views
- **Calendar**: See upcoming events by date
- **List**: Filterable card view with search
- **Map**: Interactive map with markers
- **Browse**: By WhatsApp group, tag, or location
- **Admin**: Review raw messages, fix parsing errors

### Provider Switching
- LLM: OpenAI or Claude (env var)
- Geocoding: Mapbox (paid) or Nominatim (free) (env var)

## Development

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local dev)

### Local Development

```bash
# Start database only
docker-compose up -d db

# Run API locally
cd api
npm install
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
# Enable PostGIS (first time only)
docker exec -it offerings_db psql -U offerings_user -d offerings_db -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# Access PostgreSQL
docker exec -it offerings_db psql -U offerings_user -d offerings_db

# Prisma migrations
cd api
npx prisma migrate dev --name descriptive_change
npx prisma studio  # GUI to view data
```

## Documentation

| File                                     | Content                                                   |
| ---------------------------------------- | --------------------------------------------------------- |
| [readme-api.md](./readmes/readme-api.md) | Routes, services, LLM parsing, geocoding, PostGIS queries |
| [readme-bot.md](./readmes/readme-bot.md) | WhatsApp client setup, message handling, Docker tips      |
| [readme-db.md](./readmes/readme-db.md)   | Full Prisma schema, PostGIS setup, query patterns         |
| [readme-web.md](./readmes/readme-web.md) | Nuxt structure, components, auth, map integration        |

## Environment Variables

### API
```env
DATABASE_URL=postgresql://offerings_user:offerings_pass@db:5432/offerings_db

# LLM Provider
LLM_PROVIDER=openai          # or 'claude', 'stub'
LLM_API_KEY=sk-...

# Geocoding Provider
GEOCODING_PROVIDER=mapbox    # or 'nominatim' (free)
MAPBOX_TOKEN=pk.xxx          # required if using mapbox
```

### Bot
```env
API_URL=http://api:3000
```

### Web
```env
NUXT_PUBLIC_API_URL=http://localhost:3000
NUXT_PUBLIC_MAPBOX_TOKEN=pk.xxx
ADMIN_PASSWORD=your-secret-password
```

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/ingest` | Receive raw message from bot |
| GET | `/offerings` | List offerings with filters |
| GET | `/offerings/:id` | Single offering |
| GET | `/offerings/nearby` | Distance-based search (PostGIS) |
| GET | `/offerings/raw` | List raw messages |
| POST | `/offerings/raw/:id/reparse` | Retry parsing |
| PATCH | `/offerings/:id` | Update offering (admin) |

## Status

- [x] Bot: WhatsApp message capture
- [ ] API: Routes and services structure
- [ ] API: LLM parser integration
- [ ] API: Geocoding service
- [ ] Database: Schema + PostGIS
- [ ] Web: Nuxt dashboard