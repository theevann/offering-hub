interface LocationResult {
    id: number
    name: string
    admin1?: string
    country?: string
    latitude: number
    longitude: number
}

export default defineEventHandler(async (event) => {
    const { q } = getQuery(event)
    if (typeof q !== 'string' || q.trim().length < 2 || q.trim().length > 200) {
        throw createError({ statusCode: 400, statusMessage: 'Enter a place name between 2 and 200 characters.' })
    }

    try {
        // City/town search; no browser coordinates are sent to the geocoding provider.
        const response = await $fetch<{ results?: LocationResult[] }>('https://geocoding-api.open-meteo.com/v1/search', {
            query: { name: q.trim(), count: 8, language: 'en', format: 'json' },
            timeout: 8000,
            retry: 0,
        })
        return (response.results || []).map((place) => ({
            id: place.id,
            name: place.name,
            description: [...new Set([place.admin1, place.country].filter(Boolean))].join(', '),
            lat: place.latitude,
            lng: place.longitude,
        }))
    } catch {
        throw createError({ statusCode: 502, statusMessage: 'Location search is unavailable. Please try again.' })
    }
})
