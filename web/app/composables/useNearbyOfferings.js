export function useNearbyOfferings(coordinates, radiusKm) {
    const offerings = ref([])
    const loading = ref(false)
    const error = ref('')
    let currentRequest

    async function refresh() {
        currentRequest?.abort()
        const controller = new AbortController()
        currentRequest = controller
        offerings.value = []
        error.value = ''
        loading.value = false
        if (!coordinates.value) return
        loading.value = true

        try {
            const results = []
            const pageSize = 100
            // Retrieve every page in this radius before applying text/date filters.
            // This prevents a rare activity being hidden by the nearest-results limit.
            for (let offset = 0; ; offset += pageSize) {
                const page = await $fetch('/api/nearby-offerings', {
                    query: { ...coordinates.value, radiusKm: radiusKm.value, limit: pageSize, offset },
                    signal: controller.signal,
                })
                if (controller.signal.aborted) return
                if (!Array.isArray(page)) throw new Error('Unexpected offerings response.')
                results.push(...page)
                if (page.length < pageSize) break
            }
            offerings.value = results
        } catch (cause) {
            if (!controller.signal.aborted) error.value = cause.data?.statusMessage || 'Unable to load offerings. Please try again.'
        } finally {
            if (!controller.signal.aborted) loading.value = false
        }
    }

    // Browser-only loading keeps location and date behavior consistent after hydration.
    onMounted(refresh)
    watch([() => coordinates.value?.lat, () => coordinates.value?.lng, radiusKm], refresh)
    onBeforeUnmount(() => currentRequest?.abort())
    return { offerings, loading, error, refresh }
}
