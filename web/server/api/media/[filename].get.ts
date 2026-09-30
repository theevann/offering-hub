export default defineEventHandler(async (event) => {
    const filename = getRouterParam(event, 'filename') || ''
    if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif|avif)$/i.test(filename)) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid photo filename.' })
    }
    const config = useRuntimeConfig()
    try {
        const response = await $fetch.raw<ArrayBuffer>(`${config.apiInternalBase}/media/${encodeURIComponent(filename)}`, {
            responseType: 'arrayBuffer',
        })
        setHeader(event, 'Content-Type', response.headers.get('content-type') || 'application/octet-stream')
        setHeader(event, 'X-Content-Type-Options', 'nosniff')
        return new Uint8Array(response._data!)
    } catch (error: any) {
        throw createError({ statusCode: error?.response?.status || 502, statusMessage: 'Photo unavailable.' })
    }
})
