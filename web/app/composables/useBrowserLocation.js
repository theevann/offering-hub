// Share browser-location logic; each component decides what to do with the result.
export function useBrowserLocation() {
    const locating = ref(false)
    const locationError = ref('')
    let requestId = 0

    function cancelLocationRequest() {
        // The browser request cannot be cancelled, but its late result can be ignored.
        requestId += 1
        locating.value = false
        locationError.value = ''
    }
    onBeforeUnmount(cancelLocationRequest)

    async function getCurrentLocation() {
        const currentRequest = ++requestId
        locationError.value = ''
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            locationError.value = 'Your browser does not support location sharing. Enter a place instead.'
            return null
        }
        locating.value = true
        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: false, timeout: 10000, maximumAge: 60000,
                })
            })
            if (currentRequest !== requestId) return null
            return {
                name: 'Your current location',
                lat: position.coords.latitude,
                lng: position.coords.longitude,
            }
        } catch (error) {
            if (currentRequest !== requestId) return null
            const messages = {
                1: 'Location access was denied. You can enter a place instead.',
                2: 'Your location could not be found. Try again or enter a place.',
                3: 'Finding your location took too long. Try again or enter a place.',
            }
            locationError.value = messages[error.code] || 'Unable to find your location. Enter a place instead.'
            return null
        } finally {
            if (currentRequest === requestId) locating.value = false
        }
    }

    return { locating, locationError, getCurrentLocation, cancelLocationRequest }
}
