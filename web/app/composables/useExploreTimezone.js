export async function useExploreTimezone(coordinates) {
    const userTimezone = ref('UTC')
    onMounted(() => { userTimezone.value = Intl.DateTimeFormat().resolvedOptions().timeZone })

    // Fetch during SSR too, so a fresh page already uses the location's timezone.
    // The key changes only with coordinates, not with search/filter parameters.
    const key = computed(() => `location-timezone:${coordinates.value?.lat}:${coordinates.value?.lng}`)
    const { data, status, error } = await useAsyncData(key, async (_app, { signal }) => {
        if (!coordinates.value) return { timeZone: '' }
        return await $fetch('/api/location-timezone', { query: coordinates.value, signal })
    })

    const locationTimezone = computed(() => data.value?.timeZone || '')
    const loadingTimezone = computed(() => status.value === 'pending')
    return { userTimezone, locationTimezone, loadingTimezone, timezoneError: error }
}
