# API Implementation Guide

## Folder Structure

```
api/src/
├── index.js              # Express app setup, middleware, routes mounting
├── routes/
│   ├── ingest.js         # POST /ingest - receives raw messages from bot
│   └── offerings.js      # GET routes for frontend consumption
├── services/
│   ├── ingestionService.js  # Orchestrates: save raw → parse → geocode → save offering
│   ├── parsingService.js    # LLM integration: prompt, call, validate response
│   └── geocodingService.js  # Geocoding: convert location text to coordinates
├── db/
│   └── prismaClient.js   # Singleton Prisma client instance
└── utils/
    └── errors.js         # Custom error classes and handlers
```

## Route Specifications

### `routes/ingest.js`

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/ingest` | Receive raw message from bot, process and store |

**Request body:**
```json
{
  "source": "whatsapp",
  "messageId": "3EB0...",
  "senderId": "123456789@c.us",
  "senderPhone": "123456789",
  "senderName": "John Doe",
  "groupId": "123456789-987654321@g.us",
  "groupName": "Yoga Events Bali",
  "rawText": "Join our yoga class tomorrow at 5pm! 50k IDR"
}
```

**Response (201):**
```json
{
  "rawMessage": { "id": "clx...", "status": "PARSED" },
  "offering": { "id": "clx...", "title": "Yoga class", "category": "CLASS", "latitude": -8.4095, "longitude": 115.1889 }
}
```

**Implementation tips:**
- Validate incoming payload with Zod before processing
- Call `ingestionService.processIncoming(data)` which handles the full flow
- Return both raw message and parsed offering in response

### `routes/offerings.js`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/offerings/all` | List active offerings |
| GET | `/offerings/nearby` | Find offerings within distance (PostGIS) |
| GET | `/offerings/raw/all` | Deprecated raw message endpoint |

**Query parameters for `GET /offerings/nearby`:**
```
?lat=15.6180
&lng=73.7087
&radiusKm=50
&limit=20
```

The implementation keeps `latitude` / `longitude` as Prisma scalar fields and uses a PostGIS `location geography(Point, 4326)` column for `ST_DWithin` and `ST_Distance` queries.

## Service Layer

### `services/ingestionService.js`

**Responsibilities:**
- Create RawMessage record
- Call parsingService.parse()
- Call geocodingService.geocode()
- Create Offering record from parsed data
- Handle parse failures gracefully

```js
const ingestionService = {
  async processIncoming(data) {
    const raw = await prisma.rawMessage.create({
      data: { ...data, status: 'PROCESSING' }
    })
    
    try {
      const parsed = await parsingService.parse(data.rawText)
      
      let coords = null
      if (parsed.location) {
        coords = await geocodingService.geocode(parsed.location)
      }
      
      const offering = await prisma.offering.create({
        data: {
          rawMessageId: raw.id,
          ...parsed,
          ...coords,
        }
      })
      
      await prisma.rawMessage.update({
        where: { id: raw.id },
        data: { status: 'PARSED' }
      })
      
      return { rawMessage: raw, offering }
      
    } catch (err) {
      await prisma.rawMessage.update({
        where: { id: raw.id },
        data: { status: 'FAILED', parseError: err.message }
      })
      
      return { rawMessage: raw, offering: null, error: err.message }
    }
  },
  
  async reprocess(rawMessageId) {
    const raw = await prisma.rawMessage.findUnique({ where: { id: rawMessageId } })
    if (!raw) throw new NotFoundError('RawMessage')
    
    await prisma.rawMessage.update({
      where: { id: raw.id },
      data: { status: 'PROCESSING', parseError: null }
    })
    
    // ... same logic as processIncoming
  }
}
```

### `services/parsingService.js`

**Responsibilities:**
- Build structured prompt for LLM
- Call LLM API (OpenAI/Claude/stub)
- Parse and validate JSON response
- Normalize and clean data

```js
const parsingService = {
  async parse(rawText) {
    const prompt = buildPrompt(rawText)
    const response = await callLLM(prompt)
    return validateAndClean(response)
  }
}

function buildPrompt(rawText) {
  const today = new Date().toISOString().split('T')[0]
  return `You are an event extraction assistant. Parse this WhatsApp message into structured data.

Message: "${rawText}"

Extract and respond in JSON format:
{
  "category": "CLASS" | "WORKSHOP" | "GATHERING" | "SERVICE" | "SALE" | "OTHER",
  "title": "Brief title (max 100 chars)",
  "description": "Full description if provided",
  "date": "ISO date string or null",
  "endDate": "ISO date string or null if single-day",
  "country": "Country name if mentioned or inferable",
  "region": "State/province/region if mentioned",
  "city": "City/town/village if mentioned",
  "locationRaw": "Original location text from message",
  "contactInfo": "Phone, email, or contact method if mentioned",
  "signupRequired": true | false,
  "tags": ["yoga", "outdoor", ...relevant tags],
  "price": {
    "type": "fixed" | "range" | "free" | "donation",
    "amount": number | null,
    "min": number | null,
    "max": number | null,
    "currency": "USD" | "EUR" | "IDR" | "INR" | etc,
    "notes": "Any price notes"
  }
}

Rules:
- If information is unclear, use null
- Infer category from context
- Extract relative dates (tomorrow, next week) as ISO dates assuming today is ${today}
- Tags should be lowercase, no spaces
- For location, extract as much detail as possible (country/region/city hierarchy)
- Common locations: Goa, Dharamshala, Rishikesh (India), Bali (Indonesia), Da Nang (Vietnam)`
}

async function callLLM(prompt) {
  const provider = process.env.LLM_PROVIDER || 'stub'
  
  if (provider === 'stub') {
    return {
      category: 'OTHER',
      title: 'Parsed message',
      tags: []
    }
  }
  
  if (provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.LLM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }
      })
    })
    const data = await response.json()
    return JSON.parse(data.choices[0].message.content)
  }
  
  if (provider === 'claude') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.LLM_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    })
    const data = await response.json()
    return JSON.parse(data.content[0].text)
  }
  
  throw new Error(`Unknown LLM provider: ${provider}`)
}

function validateAndClean(parsed) {
  return {
    category: parsed.category || 'OTHER',
    title: parsed.title?.slice(0, 200) || null,
    description: parsed.description || null,
    date: parsed.date ? new Date(parsed.date) : null,
    endDate: parsed.endDate ? new Date(parsed.endDate) : null,
    country: parsed.country || null,
    region: parsed.region || null,
    city: parsed.city || null,
    locationRaw: parsed.locationRaw || null,
    contactInfo: parsed.contactInfo || null,
    signupRequired: parsed.signupRequired || false,
    tags: parsed.tags || [],
    price: parsed.price || null,
    parsedJson: parsed
  }
}
```

### `services/geocodingService.js`

**Responsibilities:**
- Convert location text to coordinates
- Support multiple providers (Mapbox, Nominatim)
- Handle failures gracefully

```js
const PROVIDERS = {
  nominatim: {
    name: 'nominatim',
    async geocode(locationText) {
      const url = `https://nominatim.openstreetmap.org/search?` + 
        new URLSearchParams({
          q: locationText,
          format: 'json',
          limit: 1
        })
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'COIE-Offerings-Bot/1.0' }
      })
      const data = await response.json()
      
      if (data?.[0]) {
        return {
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon)
        }
      }
      return null
    }
  },
  
  mapbox: {
    name: 'mapbox',
    async geocode(locationText) {
      const token = process.env.MAPBOX_TOKEN
      if (!token) throw new Error('MAPBOX_TOKEN not set')
      
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
        `${encodeURIComponent(locationText)}.json?access_token=${token}&limit=1`
      
      const response = await fetch(url)
      const data = await response.json()
      
      if (data.features?.[0]) {
        const [lng, lat] = data.features[0].center
        return { latitude: lat, longitude: lng }
      }
      return null
    }
  }
}

const geocodingService = {
  async geocode(locationText) {
    if (!locationText?.trim()) return null
    
    const providerName = process.env.GEOCODING_PROVIDER || 'nominatim'
    const provider = PROVIDERS[providerName]
    
    if (!provider) {
      throw new Error(`Unknown geocoding provider: ${providerName}`)
    }
    
    try {
      const coords = await provider.geocode(locationText)
      console.log(`Geocoded "${locationText}" via ${providerName}:`, coords)
      return coords
    } catch (err) {
      console.error(`Geocoding failed for "${locationText}":`, err.message)
      return null
    }
  },
  
  getProvider() {
    return process.env.GEOCODING_PROVIDER || 'nominatim'
  },
  
  setProvider(name) {
    if (!PROVIDERS[name]) throw new Error(`Unknown provider: ${name}`)
    process.env.GEOCODING_PROVIDER = name
  }
}

module.exports = geocodingService
```

## Distance Query with PostGIS

```js
// In routes/offerings.js
router.get('/nearby', async (req, res) => {
  const { lat, lng, radiusKm = 50, limit = 20 } = req.query
  
  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng required' })
  }
  
  const userLat = parseFloat(lat)
  const userLng = parseFloat(lng)
  const radius = parseFloat(radiusKm) * 1000 // PostGIS uses meters
  
  const results = await prisma.$queryRaw`
    SELECT 
      id, title, category, date, "locationRaw", country, region, city,
      latitude, longitude,
      ST_Distance(
        ST_MakePoint(longitude, latitude)::geography,
        ST_MakePoint(${userLng}, ${userLat})::geography
      ) / 1000 as distance_km
    FROM "Offering"
    WHERE latitude IS NOT NULL
      AND ST_DWithin(
        ST_MakePoint(longitude, latitude)::geography,
        ST_MakePoint(${userLng}, ${userLat})::geography,
        ${radius}
      )
    ORDER BY distance_km
    LIMIT ${parseInt(limit)}
  `
  
  res.json(results)
})
```

## Zod Validation

Create `schemas/message.schema.js`:

```js
const { z } = require('zod')

const rawMessageSchema = z.object({
  source: z.string().default('whatsapp'),
  messageId: z.string().optional(),
  senderId: z.string(),
  senderPhone: z.string().optional(),
  senderName: z.string().optional(),
  groupId: z.string().optional(),
  groupName: z.string().optional(),
  rawText: z.string().min(1, 'rawText is required')
})

const offeringQuerySchema = z.object({
  category: z.enum(['CLASS', 'WORKSHOP', 'GATHERING', 'SERVICE', 'SALE', 'OTHER']).optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  search: z.string().optional(),
  tags: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
})

const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().positive().default(50),
  limit: z.coerce.number().int().positive().max(100).default(20)
})

const offeringUpdateSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().optional(),
  category: z.enum(['CLASS', 'WORKSHOP', 'GATHERING', 'SERVICE', 'SALE', 'OTHER']).optional(),
  date: z.string().datetime().nullable().optional(),
  country: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  tags: z.array(z.string()).optional()
})

module.exports = { 
  rawMessageSchema, 
  offeringQuerySchema, 
  nearbyQuerySchema,
  offeringUpdateSchema 
}
```

## Error Handling

Create `utils/errors.js`:

```js
class AppError extends Error {
  constructor(message, statusCode) {
    super(message)
    this.statusCode = statusCode
    this.isOperational = true
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400)
  }
}

class NotFoundError extends AppError {
  constructor(resource) {
    super(`${resource} not found`, 404)
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401)
  }
}

module.exports = { AppError, ValidationError, NotFoundError, UnauthorizedError }
```

## Prisma Client Singleton

`db/prismaClient.js`:

```js
const { PrismaClient } = require('@prisma/client')

const globalForPrisma = globalThis

const prisma = globalForPrisma.prisma || new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

module.exports = { prisma }
```

## Main App Setup

`index.js`:

```js
require('dotenv').config()
const express = require('express')
const ingestRoutes = require('./routes/ingest')
const offeringsRoutes = require('./routes/offerings')

const app = express()
app.use(express.json())

app.use('/ingest', ingestRoutes)
app.use('/offerings', offeringsRoutes)

app.get('/', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use((err, req, res, next) => {
  console.error(err)
  const status = err.statusCode || 500
  res.status(status).json({ error: err.message })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`)
})
```

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://offerings_user:offerings_pass@db:5432/offerings_db

# LLM
LLM_PROVIDER=openai
LLM_API_KEY=sk-...

# Geocoding
GEOCODING_PROVIDER=mapbox
MAPBOX_TOKEN=pk.xxx
```

## Implementation Order

1. [ ] Update Prisma schema (see readme-db.md) with location fields
2. [ ] Enable PostGIS extension in database
3. [ ] Create db/prismaClient.js
4. [ ] Create utils/errors.js
5. [ ] Create schemas/message.schema.js
6. [ ] Create services/parsingService.js (start with stub parser)
7. [ ] Create services/geocodingService.js (start with nominatim)
8. [ ] Create services/ingestionService.js
9. [ ] Create routes/ingest.js
10. [ ] Create routes/offerings.js (including /nearby with PostGIS)
11. [ ] Update index.js with routes
12. [ ] Test with Postman/curl
13. [ ] Integrate real LLM provider
14. [ ] Switch to Mapbox if needed

## Provider Switching

**Free tier (Nominatim):**
```env
GEOCODING_PROVIDER=nominatim
```

**Paid tier (Mapbox):**
```env
GEOCODING_PROVIDER=mapbox
MAPBOX_TOKEN=pk.xxx
```

No code changes needed - just swap env vars.
