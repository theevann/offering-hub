import tzLookup from '@photostructure/tz-lookup'

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id')
    if (!id || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid offering ID.' })
    }
    const config = useRuntimeConfig()
    try {
        const offering = await $fetch<any>(`${config.apiInternalBase}/offerings/${encodeURIComponent(id)}`)
        const lat = offering.latitude ?? offering.venue?.latitude
        const lng = offering.longitude ?? offering.venue?.longitude
        const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng)
            && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
        const timeZone = hasCoordinates ? tzLookup(lat, lng) : offering.group?.timezone || 'UTC'
        return { ...offering, timeZone }
    } catch (error: any) {
        throw createError({
            statusCode: error?.response?.status || 500,
            statusMessage: error?.response?.status === 404 ? 'Offering not found.' : 'Unable to load this offering.',
        })
    }
})
