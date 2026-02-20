# Database Schema Guide

## Schema Overview

The database uses two main tables: `RawMessage` and `Offering`. This separation allows:
- Storing unprocessed messages before parsing
- Re-parsing failed messages without data loss
- Tracking parse status and errors
- Keeping raw data for future improvements

## PostGIS Setup

PostGIS is required for distance-based queries. Enable it once:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

In docker-compose, ensure the postgres image supports PostGIS, or add initialization:

```yaml
db:
  image: postgis/postgis:16-3.4-alpine
```

Or use standard postgres and run the CREATE EXTENSION command manually.

## Full Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum OfferingCategory {
  CLASS      // Structured recurring sessions (yoga, language, etc.)
  WORKSHOP   // One-off educational events
  GATHERING  // Social events, markets, meetups
  SERVICE    // Ongoing offerings (therapy, coaching)
  SALE       // Items for sale
  OTHER      // Doesn't fit other categories
}

enum ParseStatus {
  PENDING     // Not yet processed
  PROCESSING  // Currently being parsed
  PARSED_OK      // Successfully parsed into Offering
  PARSED_PARTIAL // Parsed but missing key fields (e.g. no date)
  PARSED_NOOP
  FAILED      // Parsing failed, check parseError
}

model RawMessage {
  id          String      @id @default(cuid())
  source      String      @default("whatsapp")
  
  // WhatsApp metadata
  messageId   String?     @unique
  senderId    String
  senderPhone String?
  senderName  String?
  groupId     String?
  groupName   String?
  
  // Content
  rawText     String
  
  // Processing state
  status      ParseStatus @default(PENDING)
  parseError  String?
  
  createdAt   DateTime    @default(now())
  
  // Relations
  offering    Offering?
  
  @@index([groupId])
  @@index([status])
  @@index([createdAt])
}

model Offering {
  id            String           @id @default(cuid())
  rawMessage    RawMessage       @relation(fields: [rawMessageId], references: [id], onDelete: Cascade)
  rawMessageId  String           @unique
  
  // Classification
  category      OfferingCategory @default(OTHER)
  
  // Core fields
  title         String?
  description   String?          @db.Text
  date          DateTime?
  endDate       DateTime?
  contactInfo   String?
  
  // Structured location (LLM extracted)
  country       String?
  region        String?          // State/province
  city          String?
  locationRaw   String?          // Original text before parsing
  
  // Coordinates (Geocoded)
  latitude      Float?
  longitude     Float?
  
  // Flags
  signupRequired Boolean         @default(false)
  
  // Flexible categorization
  tags          String[]
  
  // Price structure
  price         Json?
  
  // Raw LLM output for debugging
  parsedJson    Json?
  
  createdAt     DateTime         @default(now())
  
  @@index([category])
  @@index([date])
  @@index([createdAt])
  @@index([country])
  @@index([region])
  @@index([city])
  @@index([latitude, longitude])
}
```

## Field Explanations

### RawMessage

| Field | Type | Purpose |
|-------|------|---------|
| `id` | cuid | URL-friendly unique ID |
| `source` | String | Origin platform (whatsapp, future: telegram, etc.) |
| `messageId` | String? | WhatsApp message ID for deduplication |
| `senderId` | String | WhatsApp user ID (for grouping by sender) |
| `senderPhone` | String? | Phone number if available |
| `senderName` | String? | Display name |
| `groupId` | String? | WhatsApp group ID (null for direct messages) |
| `groupName` | String? | Human-readable group name |
| `rawText` | String | Original message text |
| `status` | ParseStatus | Processing state |
| `parseError` | String? | Error message if parsing failed |

### Offering

| Field | Type | Purpose |
|-------|------|---------|
| `category` | Enum | Primary classification |
| `title` | String? | Extracted event title |
| `description` | Text | Full description |
| `date` | DateTime? | Event start date/time |
| `endDate` | DateTime? | Event end date/time (for multi-day) |
| `country` | String? | Country (India, Vietnam, Indonesia...) |
| `region` | String? | State/region (Goa, Dharamshala, Bali...) |
| `city` | String? | City/town (Arambol, McLeod Ganj, Ubud...) |
| `locationRaw` | String? | Original location text from message |
| `latitude` | Float? | Geocoded latitude |
| `longitude` | Float? | Geocoded longitude |
| `contactInfo` | String? | Phone/email for signup |
| `signupRequired` | Boolean | Whether signup is needed |
| `tags` | String[] | Flexible categorization |
| `price` | Json? | Structured price info |
| `parsedJson` | Json? | Raw LLM response for debugging |

## Location Hierarchy Examples

| locationRaw | country | region | city |
|-------------|---------|--------|------|
| "Arambol, Goa" | India | Goa | Arambol |
| "McLeod Ganj, Dharamshala" | India | Himachal Pradesh | McLeod Ganj |
| "Ubud, Bali" | Indonesia | Bali | Ubud |
| "Da Nang, Vietnam" | Vietnam | Da Nang | Da Nang |

## Price JSON Structure

```json
// Fixed price
{ "type": "fixed", "amount": 50, "currency": "EUR" }

// Price range
{ "type": "range", "min": 20, "max": 40, "currency": "USD", "notes": "sliding scale" }

// Free event
{ "type": "free" }

// Donation based
{ "type": "donation", "notes": "suggested $10-20" }
```

## Indexes Explained

```prisma
@@index([groupId])           // Filter by group in dashboard
@@index([status])            // Find PENDING/FAILED messages for processing
@@index([createdAt])         // Time-based queries, pagination

@@index([category])          // Filter offerings by category
@@index([date])              // Calendar view, upcoming events
@@index([country])           // Filter by country
@@index([region])            // Filter by region
@@index([city])              // Filter by city
@@index([latitude, longitude]) // Distance queries with PostGIS
```

## Migration Workflow

### Initial Setup

```bash
cd api

# Generate Prisma client
npx prisma generate

# Create initial migration
npx prisma migrate dev --name init
```

### Enable PostGIS (after first migration)

```bash
# Connect to database
docker exec -it offerings_db psql -U offerings_user -d offerings_db

# Enable extension
CREATE EXTENSION IF NOT EXISTS postgis;

# Verify
SELECT PostGIS_Version();
```

### Schema Changes

```bash
# After modifying schema.prisma:
npx prisma migrate dev --name add_location_fields

# This will:
# 1. Generate migration SQL
# 2. Apply to database
# 3. Regenerate Prisma client
```

### Reset During Development

```bash
# ⚠️ Destroys all data, applies all migrations fresh
npx prisma migrate reset

# Re-enable PostGIS after reset
docker exec -it offerings_db psql -U offerings_user -d offerings_db -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

## Query Patterns

### Get unprocessed messages
```js
const pending = await prisma.rawMessage.findMany({
  where: { status: 'PENDING' },
  orderBy: { createdAt: 'asc' }
})
```

### Get offerings by location
```js
const goaOfferings = await prisma.offering.findMany({
  where: {
    region: { equals: 'Goa', mode: 'insensitive' }
  },
  include: { rawMessage: true }
})
```

### Get offerings by date range
```js
const events = await prisma.offering.findMany({
  where: {
    date: {
      gte: new Date('2025-01-01'),
      lte: new Date('2025-12-31')
    }
  },
  orderBy: { date: 'asc' }
})
```

### Distance query with PostGIS
```js
const userLat = 15.6180
const userLng = 73.7087
const radiusMeters = 50000 // 50km

const nearby = await prisma.$queryRaw`
  SELECT 
    id, title, category, latitude, longitude,
    ST_Distance(
      ST_MakePoint(longitude, latitude)::geography,
      ST_MakePoint(${userLng}, ${userLat})::geography
    ) / 1000 as distance_km
  FROM "Offering"
  WHERE latitude IS NOT NULL
    AND ST_DWithin(
      ST_MakePoint(longitude, latitude)::geography,
      ST_MakePoint(${userLng}, ${userLat})::geography,
      ${radiusMeters}
    )
  ORDER BY distance_km
  LIMIT 20
`
```

### Get unique locations (for filter dropdowns)
```js
const countries = await prisma.offering.findMany({
  where: { country: { not: null } },
  select: { country: true },
  distinct: ['country']
})

const regionsByCountry = await prisma.offering.groupBy({
  by: ['country', 'region'],
  where: { country: { not: null }, region: { not: null } },
  _count: true
})
```

### Search offerings
```js
const results = await prisma.offering.findMany({
  where: {
    OR: [
      { title: { contains: 'yoga', mode: 'insensitive' } },
      { description: { contains: 'yoga', mode: 'insensitive' } },
      { tags: { has: 'yoga' } },
      { city: { contains: 'yoga', mode: 'insensitive' } }
    ]
  }
})
```

### Filter by category and location
```js
const classes = await prisma.offering.findMany({
  where: {
    category: 'CLASS',
    country: 'India',
    region: 'Goa'
  }
})
```

## Data Relationships

```
RawMessage (1) ──────── (0..1) Offering
     │                         │
     │ created from            │ links back
     ▼                         ▼
  [raw text]              [structured data]
```

- Each `RawMessage` can have at most one `Offering`
- Each `Offering` must have exactly one `RawMessage`
- Cascade delete: if RawMessage deleted, Offering also deleted

## Docker Configuration

Update `docker-compose.yml` to use PostGIS-enabled image:

```yaml
services:
  db:
    image: postgis/postgis:16-3.4-alpine
    container_name: offerings_db
    restart: always
    environment:
      POSTGRES_USER: offerings_user
      POSTGRES_PASSWORD: offerings_pass
      POSTGRES_DB: offerings_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/
```

Or add init script to enable PostGIS on standard postgres:

```yaml
services:
  db:
    image: postgres:16
    volumes:
      - postgres_data:/var/lib/postgresql/
      - ./init-db.sql:/docker-entrypoint-initdb.d/init-db.sql
```

`init-db.sql`:
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

## Performance Tips

1. **Use `select` for large queries:**
   ```js
   await prisma.offering.findMany({
     select: { id: true, title: true, date: true, city: true }
   })
   ```

2. **Paginate large datasets:**
   ```js
   const page = 1
   const limit = 20
   const [items, total] = await Promise.all([
     prisma.offering.findMany({
       skip: (page - 1) * limit,
       take: limit
     }),
     prisma.offering.count()
   ])
   ```

3. **Use transactions for related updates:**
   ```js
   await prisma.$transaction([
     prisma.rawMessage.update({ where: { id }, data: { status: 'PARSED' } }),
     prisma.offering.create({ data: { ... } })
   ])
   ```

4. **Spatial index for PostGIS:**
   ```sql
   CREATE INDEX idx_offering_location ON "Offering" 
   USING GIST (ST_MakePoint(longitude, latitude)::geography);
   ```
   
   Note: Prisma doesn't support GIST indexes natively, run this manually after migration.