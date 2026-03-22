import { computed, onMounted, reactive, ref } from 'vue'

const DAY_MS = 24 * 60 * 60 * 1000

function parseDateMs(value) {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

function formatPrice(pricingType, price) {
  if (!price && !pricingType) return 'No pricing info'
  if (!price) return pricingType
  if (typeof price === 'string') return price

  if (Array.isArray(price?.options) && price.options.length) {
    return price.options
      .map((option) => `${option.description || 'option'}: ${option.amount || '?'} ${option.currency || ''}`.trim())
      .join(' | ')
  }

  if (price?.amount != null) {
    return `${price.amount} ${price.currency || ''}`.trim()
  }

  if (price?.minAmount != null && price?.maxAmount != null) {
    return `${price.minAmount}-${price.maxAmount} ${price.currency || ''}`.trim()
  }

  return JSON.stringify(price)
}

function normalizePricingType(value, hasPrice) {
  const normalized = (value || '').toLowerCase()
  if (normalized) return normalized
  return hasPrice ? 'fixed' : 'unknown'
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

function generateGoogleMapsUrl(offering) {
  const venue = offering.venue
  if (!venue?.googlePlaceId) return null
  
  const query = venue.displayName || venue.address || 'Location'
  const placeId = venue.googlePlaceId
  
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&query_place_id=${placeId}`
}

export function useOfferingExplorer() {
  const offerings = ref([])
  const groups = ref([])
  const loading = ref(true)
  const error = ref('')

  const filters = reactive({
    search: '',
    categories: [],
    pricingTypes: [],
    country: '',
    city: '',
    groupId: '',
    datePreset: 'all',
    pricingPreset: 'all',
    sortBy: 'soonest',
  })

  const config = useRuntimeConfig()

  const refresh = async () => {
    loading.value = true
    error.value = ''

    try {
      // const apiBase = config.public.apiBase || 'http://localhost:3000'
      // const offeringsRes = await fetch(`${apiBase}/offerings/all`)
      const offeringsList = await $fetch('/api/offerings')
      console.log('Fetched offerings:', offeringsList) // Debug log

      const safeList = Array.isArray(offeringsList) ? offeringsList : []
      const discoveredGroups = new Map()

      offerings.value = safeList.map((offering) => {
        const group = offering.rawMessage?.group || null
        if (group?.id && !discoveredGroups.has(group.id)) {
          discoveredGroups.set(group.id, group)
        }

        const startMs = parseDateMs(offering.startTime)
        const endMs = parseDateMs(offering.endTime)
        const pricingType = normalizePricingType(offering.pricingType, Boolean(offering.price))
        const country = group?.country || null
        const city = group?.city || null
        const locationLabel = offering.venue?.displayName || offering.venue?.address || offering.location || [city, country].filter(Boolean).join(', ') || 'Location TBD'

        return {
          ...offering,
          group,
          country,
          city,
          pricingType,
          locationLabel,
          priceLabel: formatPrice(offering.pricingType, offering.price),
          startMs,
          endMs,
          searchIndex: [
            offering.title,
            offering.description,
            offering.category,
            offering.location,
            offering.pricingType,
            group?.name,
            city,
            country,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase(),
        }
      })
      groups.value = [...discoveredGroups.values()]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
      groups.value = []
      offerings.value = []
    } finally {
      loading.value = false
    }
  }

  onMounted(refresh)

  const categoryOptions = computed(() => uniqueSorted(offerings.value.map((offering) => offering.category || 'OTHER')))
  const pricingOptions = computed(() => uniqueSorted(offerings.value.map((offering) => offering.pricingType || 'unknown')))
  const countryOptions = computed(() => uniqueSorted(offerings.value.map((offering) => offering.country)))

  const cityOptions = computed(() => {
    const cityCandidates = offerings.value
      .filter((offering) => !filters.country || offering.country === filters.country)
      .map((offering) => offering.city)

    return uniqueSorted(cityCandidates)
  })

  const groupOptions = computed(() => {
    const seen = new Map()

    for (const group of groups.value) {
      seen.set(group.id, group)
    }

    for (const offering of offerings.value) {
      if (offering.group?.id && !seen.has(offering.group.id)) {
        seen.set(offering.group.id, offering.group)
      }
    }

    return [...seen.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  })

  const filteredOfferings = computed(() => {
    const search = filters.search.trim().toLowerCase()
    const now = Date.now()
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const dayStart = startOfToday.getTime()

    const filtered = offerings.value.filter((offering) => {
      if (search && !offering.searchIndex.includes(search)) return false
      if (filters.categories.length && !filters.categories.includes(offering.category)) return false
      if (filters.pricingTypes.length && !filters.pricingTypes.includes(offering.pricingType)) return false
      if (filters.country && offering.country !== filters.country) return false
      if (filters.city && offering.city !== filters.city) return false
      if (filters.groupId && offering.group?.id !== filters.groupId) return false

      if (filters.pricingPreset === 'priced' && !offering.price) return false
      if (filters.pricingPreset === 'free' && offering.pricingType !== 'free') return false
      if (filters.pricingPreset === 'donation' && offering.pricingType !== 'donation') return false
      if (filters.pricingPreset === 'unknown' && offering.pricingType !== 'unknown') return false

      if (filters.datePreset !== 'all') {
        const ms = offering.startMs
        if (filters.datePreset === 'undated') return ms == null
        if (ms == null) return false

        if (filters.datePreset === 'upcoming' && ms < now) return false
        if (filters.datePreset === 'today' && (ms < dayStart || ms >= dayStart + DAY_MS)) return false
        if (filters.datePreset === 'week' && (ms < dayStart || ms >= dayStart + 7 * DAY_MS)) return false
        if (filters.datePreset === 'month' && (ms < dayStart || ms >= dayStart + 30 * DAY_MS)) return false
        if (filters.datePreset === 'past' && ms >= now) return false
      }

      return true
    })

    filtered.sort((a, b) => {
      if (filters.sortBy === 'latest') {
        return (b.startMs || 0) - (a.startMs || 0)
      }

      if (filters.sortBy === 'newest') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }

      if (filters.sortBy === 'title') {
        return (a.title || '').localeCompare(b.title || '')
      }

      if (a.startMs == null && b.startMs == null) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }
      if (a.startMs == null) return 1
      if (b.startMs == null) return -1
      return a.startMs - b.startMs
    })

    return filtered
  })

  const totalOfferings = computed(() => offerings.value.length)

  const categoryFacetCounts = computed(() => {
    const counts = {}
    for (const offering of offerings.value) {
      const key = offering.category || 'OTHER'
      counts[key] = (counts[key] || 0) + 1
    }
    return counts
  })

  const pricingFacetCounts = computed(() => {
    const counts = {}
    for (const offering of offerings.value) {
      const key = offering.pricingType || 'unknown'
      counts[key] = (counts[key] || 0) + 1
    }
    return counts
  })

  const activeFilterCount = computed(() => {
    return [
      filters.search,
      filters.country,
      filters.city,
      filters.groupId,
      filters.datePreset !== 'all' ? 'date' : '',
      filters.pricingPreset !== 'all' ? 'pricing' : '',
      filters.sortBy !== 'soonest' ? 'sort' : '',
      ...filters.categories,
      ...filters.pricingTypes,
    ].filter(Boolean).length
  })

  const stats = computed(() => {
    const total = offerings.value.length
    const upcoming = offerings.value.filter((offering) => offering.startMs != null && offering.startMs >= Date.now()).length
    const priced = offerings.value.filter((offering) => offering.price != null).length
    const withLocation = offerings.value.filter((offering) => offering.country || offering.city || offering.location).length

    return { total, upcoming, priced, withLocation }
  })

  const toggleCategory = (category) => {
    if (filters.categories.includes(category)) {
      filters.categories = filters.categories.filter((value) => value !== category)
    } else {
      filters.categories = [...filters.categories, category]
    }
  }

  const togglePricingType = (pricingType) => {
    if (filters.pricingTypes.includes(pricingType)) {
      filters.pricingTypes = filters.pricingTypes.filter((value) => value !== pricingType)
    } else {
      filters.pricingTypes = [...filters.pricingTypes, pricingType]
    }
  }

  const clearFilters = () => {
    filters.search = ''
    filters.categories = []
    filters.pricingTypes = []
    filters.country = ''
    filters.city = ''
    filters.groupId = ''
    filters.datePreset = 'all'
    filters.pricingPreset = 'all'
    filters.sortBy = 'soonest'
  }

  return {
    offerings,
    groups,
    loading,
    error,
    filters,
    filteredOfferings,
    categoryOptions,
    pricingOptions,
    countryOptions,
    cityOptions,
    groupOptions,
    activeFilterCount,
    totalOfferings,
    categoryFacetCounts,
    pricingFacetCounts,
    stats,
    toggleCategory,
    togglePricingType,
    clearFilters,
    refresh,
    generateGoogleMapsUrl,
  }
}
