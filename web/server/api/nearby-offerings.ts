export default defineEventHandler(async (event) => {
    const config = useRuntimeConfig()
    const { lat, lng, radiusKm = 10, limit = 100, offset = 0 } = getQuery(event)

    if (lat === undefined || lng === undefined) {
        throw createError({ statusCode: 400, statusMessage: 'Latitude and longitude are required.' })
    }

    try {
        return await $fetch(`${config.apiInternalBase}/offerings/nearby`, {
            query: { lat, lng, radiusKm, limit, offset },
        })
    } catch (error: any) {
        throw createError({
            statusCode: error?.response?.status || 500,
            statusMessage: error?.data?.error || 'Unable to load nearby offerings.',
        })
    }
})
