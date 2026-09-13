import tzLookup from '@photostructure/tz-lookup'

export default defineEventHandler((event) => {
    const { lat, lng } = getQuery(event)
    if (typeof lat !== 'string' || !lat.trim() || typeof lng !== 'string' || !lng.trim()
        || !Number.isFinite(Number(lat)) || Math.abs(Number(lat)) > 90
        || !Number.isFinite(Number(lng)) || Math.abs(Number(lng)) > 180) {
        throw createError({ statusCode: 400, statusMessage: 'Valid latitude and longitude are required.' })
    }
    // Offline geographic lookup: works with map centers and browser coordinates too.
    return { timeZone: tzLookup(Number(lat), Number(lng)) }
})
