# Frontend Implementation Guide (Nuxt 3 / Vue 3)

## Overview

The frontend is a Nuxt 3 dashboard for browsing and managing offerings. It supports:
- Calendar view of upcoming events
- List view with filters
- Map view for location-based discovery
- Admin panel for reviewing and fixing parsed data

## Tech Stack

| Component     | Technology                     |
| ------------- | ------------------------------ |
| Framework     | Nuxt 3 (Vue 3)                 |
| Styling       | Tailwind CSS                   |
| Maps          | Mapbox GL JS                   |
| Data Fetching | useFetch / useAsyncData        |
| Auth          | Simple password (cookie-based) |

## Folder Structure

```
web/
|-- pages/
|   |-- index.vue                 # Home -> redirect to /calendar
|   |-- calendar.vue              # Calendar view
|   |-- list.vue                  # List view with filters
|   |-- map.vue                   # Map view
|   |-- browse/
|   |   |-- index.vue             # Browse overview
|   |   |-- groups.vue            # By WhatsApp group
|   |   |-- tags.vue              # By tag
|   |   `-- locations.vue         # By country/region/city
|   |-- offerings/
|   |   `-- [id].vue              # Offering detail
|   `-- admin/
|       |-- index.vue             # Admin dashboard
|       |-- login.vue             # Login form
|       |-- raw.vue               # Raw messages list
|       `-- offerings/
|           `-- [id]/
|               `-- edit.vue      # Edit offering
|
|-- components/
|   |-- layout/
|   |   |-- Nav.vue
|   |   `-- Footer.vue
|   |-- filters/
|   |   |-- FilterBar.vue
|   |   |-- CategoryFilter.vue
|   |   |-- LocationFilter.vue
|   |   `-- DateFilter.vue
|   |-- offering/
|   |   |-- OfferingCard.vue
|   |   |-- OfferingDetail.vue
|   |   `-- OfferingList.vue
|   |-- calendar/
|   |   `-- CalendarView.vue
|   |-- map/
|   |   `-- MapView.vue
|   `-- admin/
|       |-- RawMessageList.vue
|       |-- ParseStatusBadge.vue
|       `-- OfferingEditForm.vue
|
|-- composables/
|   |-- useApi.ts                 # API fetch functions
|   |-- useAuth.ts                # Auth utilities
|   |-- useOfferings.ts
|   `-- usePolling.ts
|
|-- types/
|   `-- index.ts                  # TypeScript types
|
|-- public/
|   `-- ...
|
|-- .env
|-- nuxt.config.ts
|-- package.json
|-- tailwind.config.js
`-- tsconfig.json
```

## TypeScript Types

`types/index.ts`:

```ts
export type OfferingCategory = 'CLASS' | 'WORKSHOP' | 'GATHERING' | 'SERVICE' | 'SALE' | 'OTHER'

export type ParseStatus = 'PENDING' | 'PROCESSING' | 'PARSED' | 'FAILED'

export interface Price {
  type: 'fixed' | 'range' | 'free' | 'donation'
  amount?: number
  min?: number
  max?: number
  currency?: string
  notes?: string
}

export interface Offering {
  id: string
  category: OfferingCategory
  title: string | null
  description: string | null
  date: string | null
  endDate: string | null
  country: string | null
  region: string | null
  city: string | null
  locationRaw: string | null
  latitude: number | null
  longitude: number | null
  contactInfo: string | null
  signupRequired: boolean
  tags: string[]
  price: Price | null
  createdAt: string
  rawMessage?: RawMessage
}

export interface RawMessage {
  id: string
  source: string
  messageId: string | null
  senderId: string
  senderPhone: string | null
  senderName: string | null
  groupId: string | null
  groupName: string | null
  rawText: string
  status: ParseStatus
  parseError: string | null
  createdAt: string
}

export interface OfferingFilters {
  category?: OfferingCategory
  country?: string
  region?: string
  city?: string
  dateFrom?: string
  dateTo?: string
  search?: string
  tags?: string[]
  page?: number
  limit?: number
}

export interface NearbyQuery {
  lat: number
  lng: number
  radiusKm?: number
  limit?: number
}
```

## API Composable

`composables/useApi.ts`:

```ts
import type { Offering, RawMessage, OfferingFilters, NearbyQuery } from '~/types'

const API_URL = useRuntimeConfig().public.apiUrl

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `HTTP ${res.status}`)
  }
  
  return res.json()
}

export const useApi = () => {
  // Offerings
  const getOfferings = async (filters?: OfferingFilters): Promise<{ items: Offering[]; total: number }> => {
    const params = new URLSearchParams()
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) params.append(key, String(value))
      })
    }
    return fetchApi(`/offerings?${params}`)
  }
  
  const getOffering = async (id: string): Promise<Offering> => {
    return fetchApi(`/offerings/${id}`)
  }
  
  const getNearby = async (query: NearbyQuery): Promise<(Offering & { distance_km: number })[]> => {
    const params = new URLSearchParams({
      lat: String(query.lat),
      lng: String(query.lng),
      radiusKm: String(query.radiusKm || 50),
      limit: String(query.limit || 20),
    })
    return fetchApi(`/offerings/nearby?${params}`)
  }
  
  const updateOffering = async (id: string, data: Partial<Offering>): Promise<Offering> => {
    return fetchApi(`/offerings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }
  
  // Raw messages
  const getRawMessages = async (status?: ParseStatus): Promise<RawMessage[]> => {
    const params = status ? `?status=${status}` : ''
    return fetchApi(`/offerings/raw${params}`)
  }
  
  const reparseRawMessage = async (id: string): Promise<{ rawMessage: RawMessage; offering: Offering | null }> => {
    return fetchApi(`/offerings/raw/${id}/reparse`, { method: 'POST' })
  }
  
  // Stats
  const getLocations = async (): Promise<{ country: string; region: string; _count: number }[]> => {
    return fetchApi('/offerings/stats/locations')
  }
  
  const getGroups = async (): Promise<{ groupId: string; groupName: string; _count: number }[]> => {
    return fetchApi('/offerings/stats/groups')
  }
  
  const getTags = async (): Promise<{ tag: string; _count: number }[]> => {
    return fetchApi('/offerings/stats/tags')
  }
  
  return {
    getOfferings,
    getOffering,
    getNearby,
    updateOffering,
    getRawMessages,
    reparseRawMessage,
    getLocations,
    getGroups,
    getTags,
  }
}
```

## Auth Composable

`composables/useAuth.ts`:

```ts
import { useCookie, navigateTo } from '#app'

const ADMIN_PASSWORD = useRuntimeConfig().adminPassword

export const useAuth = () => {
  const authCookie = useCookie('auth', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7, // 1 week
  })
  
  const isAuthenticated = computed(() => authCookie.value === 'true')
  
  const checkAuth = (password: string): boolean => {
    return password === ADMIN_PASSWORD
  }
  
  const login = (password: string): boolean => {
    if (checkAuth(password)) {
      authCookie.value = 'true'
      return true
    }
    return false
  }
  
  const logout = () => {
    authCookie.value = undefined
  }
  
  const requireAuth = () => {
    if (!isAuthenticated.value) {
      return navigateTo('/admin/login')
    }
  }
  
  return {
    isAuthenticated,
    login,
    logout,
    requireAuth,
  }
}
```

## Admin Middleware

`middleware/admin.ts`:

```ts
export default defineNuxtRouteMiddleware((to) => {
  const { isAuthenticated } = useAuth()
  
  if (!isAuthenticated.value) {
    return navigateTo('/admin/login')
  }
})
```

## Polling Composable

`composables/usePolling.ts`:

```ts
export const usePolling = (
  callback: () => void,
  interval: number = 30000, // 30 seconds
  enabled: Ref<boolean> = ref(true)
) => {
  let timer: NodeJS.Timeout | null = null
  
  watch(enabled, (isEnabled) => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    
    if (isEnabled) {
      timer = setInterval(callback, interval)
    }
  }, { immediate: true })
  
  onUnmounted(() => {
    if (timer) {
      clearInterval(timer)
    }
  })
}
```

## Key Components

### Calendar View

`pages/calendar.vue`:

```vue
<script setup lang="ts">
const { getOfferings } = useApi()

const { data: offerings } = await useAsyncData('calendar-offerings', () =>
  getOfferings({
    dateFrom: new Date().toISOString(),
    limit: 100,
  })
)
</script>

<template>
  <div class="p-4">
    <h1 class="text-2xl font-bold mb-4">Calendar</h1>
    <CalendarView v-if="offerings" :offerings="offerings.items" />
  </div>
</template>
```

### List View with Filters

`pages/list.vue`:

```vue
<script setup lang="ts">
const route = useRoute()
const { getOfferings, getLocations } = useApi()

const filters = computed(() => ({
  category: route.query.category as string,
  country: route.query.country as string,
  region: route.query.region as string,
}))

const { data: result } = await useAsyncData(
  () => `list-${JSON.stringify(filters.value)}`,
  () => getOfferings(filters.value)
)

const { data: locations } = await useAsyncData('locations', () => getLocations())
</script>

<template>
  <div class="p-4">
    <FilterBar v-if="locations" :locations="locations" />
    <OfferingList
      v-if="result"
      :offerings="result.items"
      :total="result.total"
    />
  </div>
</template>
```

### Map View

`components/map/MapView.vue`:

```vue
<script setup lang="ts">
import mapboxgl from 'mapbox-gl'
import type { Offering } from '~/types'

const config = useRuntimeConfig()
mapboxgl.accessToken = config.public.mapboxToken

interface Props {
  offerings: Offering[]
  userLocation?: { lat: number; lng: number }
}

const props = defineProps<Props>()

const mapRef = ref<HTMLDivElement>()
let mapInstance: mapboxgl.Map | null = null

onMounted(() => {
  if (!mapRef.value) return
  
  mapInstance = new mapboxgl.Map({
    container: mapRef.value,
    style: 'mapbox://styles/mapbox/streets-v12',
    center: props.userLocation 
      ? [props.userLocation.lng, props.userLocation.lat]
      : [0, 20],
    zoom: props.userLocation ? 10 : 2,
  })
  
  mapInstance.addControl(new mapboxgl.NavigationControl())
})

watch(() => props.offerings, (offerings) => {
  if (!mapInstance) return
  
  offerings.forEach(offering => {
    if (offering.latitude && offering.longitude) {
      new mapboxgl.Marker()
        .setLngLat([offering.longitude, offering.latitude])
        .setPopup(
          new mapboxgl.Popup().setHTML(
            `<a href="/offerings/${offering.id}">${offering.title || 'Untitled'}</a>`
          )
        )
        .addTo(mapInstance!)
    }
  })
}, { immediate: true })

onUnmounted(() => {
  mapInstance?.remove()
})
</script>

<template>
  <div ref="mapRef" class="w-full h-[600px] rounded-lg" />
</template>
```

### Location Filter (Hierarchical)

`components/filters/LocationFilter.vue`:

```vue
<script setup lang="ts">
const { getLocations } = useApi()

interface Props {
  selectedCountry?: string
  selectedRegion?: string
  selectedCity?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  change: [filters: { country?: string; region?: string; city?: string }]
}>()

const countries = ref<string[]>([])
const regions = ref<string[]>([])

const { data: locationData } = await useAsyncData('locations', () => getLocations())

watch(locationData, (data) => {
  if (data) {
    countries.value = [...new Set(data.map(d => d.country).filter(Boolean))]
  }
}, { immediate: true })

watch(() => props.selectedCountry, (country) => {
  if (country && locationData.value) {
    const filtered = locationData.value.filter(d => d.country === country)
    regions.value = [...new Set(filtered.map(d => d.region).filter(Boolean))]
  } else {
    regions.value = []
  }
})
</script>

<template>
  <div class="flex gap-2">
    <select
      :value="selectedCountry || ''"
      @change="emit('change', { country: ($event.target as HTMLSelectElement).value || undefined })"
      class="border rounded px-2 py-1"
    >
      <option value="">All countries</option>
      <option v-for="c in countries" :key="c" :value="c">{{ c }}</option>
    </select>
    
    <select
      v-if="regions.length > 0"
      :value="selectedRegion || ''"
      @change="emit('change', { country: selectedCountry, region: ($event.target as HTMLSelectElement).value || undefined })"
      class="border rounded px-2 py-1"
    >
      <option value="">All regions</option>
      <option v-for="r in regions" :key="r" :value="r">{{ r }}</option>
    </select>
  </div>
</template>
```

## Environment Variables

`.env`:

```env
NUXT_PUBLIC_API_URL=http://localhost:3000
NUXT_PUBLIC_MAPBOX_TOKEN=pk.xxx
ADMIN_PASSWORD=your-secret-password
```

## Nuxt Config

`nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: ['@nuxtjs/tailwindcss'],
  runtimeConfig: {
    adminPassword: process.env.ADMIN_PASSWORD,
    public: {
      apiUrl: process.env.NUXT_PUBLIC_API_URL || 'http://localhost:3000',
      mapboxToken: process.env.NUXT_PUBLIC_MAPBOX_TOKEN,
    },
  },
})
```

## Docker Configuration

Add to `docker-compose.yml`:

```yaml
web:
  build: ./web
  container_name: offerings_web
  restart: always
  ports:
    - "3001:3000"
  environment:
    NUXT_PUBLIC_API_URL: http://api:3000
    NUXT_PUBLIC_MAPBOX_TOKEN: ${MAPBOX_TOKEN}
    ADMIN_PASSWORD: ${ADMIN_PASSWORD}
  depends_on:
    - api
```

`web/Dockerfile`:

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```

## Implementation Order

1. [ ] `npx nuxi@latest init web`
2. [ ] Install dependencies: `npm install mapbox-gl @types/mapbox-gl`
3. [ ] Add Tailwind: `npm install -D @nuxtjs/tailwindcss`
4. [ ] Create `types/index.ts`
5. [ ] Create `composables/useApi.ts`
6. [ ] Create `composables/useAuth.ts`
7. [ ] Create `composables/usePolling.ts`
8. [ ] Create `middleware/admin.ts`
9. [ ] Create layout components (`Nav.vue`, `Footer.vue`)
10. [ ] Create filter components
11. [ ] Create offering components (`OfferingCard.vue`, `OfferingList.vue`)
12. [ ] Implement `/list` page
13. [ ] Implement `/calendar` page
14. [ ] Implement `/map` page with Mapbox
15. [ ] Implement `/browse/*` pages
16. [ ] Implement `/offerings/[id]` detail page
17. [ ] Implement `/admin/login` page
18. [ ] Implement `/admin` pages with middleware
19. [ ] Implement `/admin/raw` page
20. [ ] Implement `/admin/offerings/[id]/edit` page
21. [ ] Add polling for real-time updates
22. [ ] Configure Docker

## Views Summary

| Path                         | Purpose                               |
| ---------------------------- | ------------------------------------- |
| `/`                          | Redirect to `/calendar` or `/list`    |
| `/calendar`                  | Month view with event markers         |
| `/list`                      | Paginated card list with filters      |
| `/map`                       | Interactive map with markers          |
| `/browse/groups`             | List by WhatsApp group                |
| `/browse/tags`               | Tag cloud with counts                 |
| `/browse/locations`          | Country -> Region -> City drill-down  |
| `/offerings/[id]`            | Single offering detail                |
| `/admin/login`               | Password login                        |
| `/admin`                     | Admin dashboard (stats, recent)       |
| `/admin/raw`                 | Review raw messages, reparse failures |
| `/admin/offerings/[id]/edit` | Manual correction form                |