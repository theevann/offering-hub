<script setup>
const props = defineProps({
    name: { type: String, required: true },
    radiusKm: { type: Number, default: 10 },
})
const emit = defineEmits(['select', 'update:radiusKm'])
const isOpen = ref(false)
const query = ref('')
const results = ref([])
const loading = ref(false)
const error = ref('')
const { locating, locationError, getCurrentLocation, cancelLocationRequest } = useBrowserLocation()
const hasSearched = ref(false)
const searchInput = ref(null)
const locationButton = ref(null)
const locationSearch = ref(null)
let currentRequest

async function openSearch() {
    isOpen.value = true
    await nextTick()
    searchInput.value?.focus()
}

function clearResults() {
    currentRequest?.abort()
    results.value = []
    loading.value = false
    error.value = ''
    hasSearched.value = false
}

async function closeSearch(restoreFocus = true) {
    clearResults()
    cancelLocationRequest()
    isOpen.value = false
    await nextTick()
    if (restoreFocus) locationButton.value?.focus()
}

function handleOutsidePointer(event) {
    if (isOpen.value && !locationSearch.value?.contains(event.target)) {
        // Let the clicked element receive focus instead of returning it to our button.
        closeSearch(false)
    }
}

onMounted(() => document.addEventListener('pointerdown', handleOutsidePointer, true))

async function searchLocations() {
    clearResults()
    if (query.value.trim().length < 2) {
        error.value = 'Enter at least two characters.'
        return
    }
    const controller = new AbortController()
    currentRequest = controller
    loading.value = true
    try {
        const places = await $fetch('/api/locations', {
            query: { q: query.value.trim() }, signal: controller.signal,
        })
        if (controller.signal.aborted) return
        results.value = places
        hasSearched.value = true
    } catch (cause) {
        if (!controller.signal.aborted) error.value = cause.data?.statusMessage || 'Unable to search locations. Please try again.'
    } finally {
        if (!controller.signal.aborted) loading.value = false
    }
}

async function useMyLocation() {
    clearResults()
    const location = await getCurrentLocation()
    if (location) selectLocation(location)
    else error.value = locationError.value
}

function selectLocation(location) {
    emit('select', location)
    closeSearch()
}
onBeforeUnmount(() => {
    currentRequest?.abort()
    document.removeEventListener('pointerdown', handleOutsidePointer, true)
})
</script>

<template>
    <div ref="locationSearch" class="location-search" @keydown.esc.stop.prevent="closeSearch()">
        <button ref="locationButton" class="location-button" type="button" :aria-expanded="isOpen"
            aria-controls="location-search-panel" @click="isOpen ? closeSearch() : openSearch()">
            <svg class="pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
                aria-hidden="true">
                <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
                <circle cx="12" cy="10" r="2.5" />
            </svg>
            {{ props.name }}<span class="mobile-radius"> · {{ radiusKm }} km</span>
        </button>
        <section v-if="isOpen" id="location-search-panel" class="search-panel" aria-label="Change location">
            <div class="mobile-radius-options" role="group" aria-label="Search radius">
                <button v-for="radius in [5, 10, 20, 50]" :key="radius" type="button"
                    :aria-pressed="radiusKm === radius" @click="emit('update:radiusKm', radius)">{{ radius }} km</button>
            </div>
            <form @submit.prevent="searchLocations">
                <div class="location-prompt">
                    <label for="location-query">Choose a city</label>, or
                    <button class="inline-location-button" type="button" :disabled="locating" @click="useMyLocation">
                        {{ locating ? 'finding your location…' : 'use my location' }}
                    </button>
                </div>
                <div class="search-row">
                    <input id="location-query" ref="searchInput" v-model="query" type="search" maxlength="200"
                        placeholder="e.g. Weligama" autocomplete="off" @input="clearResults">
                    <button type="submit" :disabled="loading || locating">{{ loading ? 'Searching…' : 'Search' }}</button>
                </div>
            </form>
            <p v-if="error" role="alert">{{ error }}</p>
            <p v-else-if="locating" role="status">Waiting for your browser’s location…</p>
            <p v-else-if="loading" role="status">Looking for places…</p>
            <p v-else-if="hasSearched && !results.length" role="status">No places found. Try another spelling or a nearby town.</p>
            <ul v-if="results.length" aria-label="Matching places">
                <li v-for="location in results" :key="location.id">
                    <button class="place-result" type="button" @click="selectLocation(location)">
                        <strong>{{ location.name }}</strong>
                        <span>{{ location.description }}</span>
                    </button>
                </li>
            </ul>
            <footer>
                <small>Places: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> / <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a></small>
                <button class="cancel" type="button" @click="closeSearch">Cancel</button>
            </footer>
        </section>
    </div>
</template>

<style scoped>
.location-search {
    position: relative;
    min-width: 0;
    justify-self: center;
}
button, input {
    font: inherit;
}
button {
    cursor: pointer;
    min-height: 2.75rem;
    border: 0;
    border-radius: 0.5rem;
    padding: 0.6rem 0.8rem;
    background: #244bd6;
    color: white;
}
button:disabled {
    opacity: 0.65;
    cursor: wait;
}
.location-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: transparent;
    color: #244bd6;
    font-weight: 600;
}
.pin {
    width: 1.25rem;
    height: 1.25rem;
    flex-shrink: 0;
}
.location-button:hover, .cancel:hover {
    background: #e9eef8;
}
.search-panel {
    position: absolute;
    top: calc(100% + 0.5rem);
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
    width: min(26rem, calc(100vw - 2rem));
    padding: 1rem;
    border: 1px solid #dce4f1;
    border-radius: 0.8rem;
    background: white;
    box-shadow: 0 8px 30px #182e5520;
}
.location-prompt {
    margin-bottom: 0.6rem;
    font-size: 0.9375rem;
    line-height: 1.6;
}
.location-prompt label {
    font-weight: 600;
}
.inline-location-button {
    display: inline;
    min-height: 0;
    padding: 0;
    border-radius: 0;
    background: transparent;
    color: #244bd6;
    font-weight: bold;
    text-underline-offset: 0.2em;
}
.inline-location-button:hover {
    color: #182e55;
}
.search-row {
    display: flex;
    gap: 0.5rem;
}
input {
    flex: 1;
    min-width: 0;
    width: 100%;
    padding: 0.7rem;
    border: 1px solid #b9c6e0;
    border-radius: 0.5rem;
    color: #182e55;
    background: white;
}
p {
    margin: 0.8rem 0;
    font-size: 0.9375rem;
}
ul {
    list-style: none;
    padding: 0;
    margin: 0.75rem 0;
    max-height: 18rem;
    overflow-y: auto;
}
.place-result {
    display: grid;
    gap: 0.25rem;
    width: 100%;
    text-align: left;
    background: white;
    color: #182e55;
}
.place-result:hover {
    background: #edf2ff;
}
.place-result span {
    color: #59677e;
    font-size: 0.875rem;
}
footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.75rem;
}
small {
    font-size: 0.75rem;
    color: #59677e;
}
a {
    color: #244bd6;
    text-decoration: underline;
}
.cancel {
    background: transparent;
    color: #244bd6;
}
button:focus-visible, input:focus-visible, a:focus-visible {
    outline: 3px solid #6684ef;
    outline-offset: 2px;
}
.mobile-radius, .mobile-radius-options { display: none; }
@media (max-width: 700px) {
    .mobile-radius { display: inline; font-size: 0.875rem; font-weight: 400; }
    .mobile-radius-options { display: flex; gap: 0.25rem; margin-bottom: 1rem; }
    .mobile-radius-options button { flex: 1; padding: 0.5rem; color: #182e55; background: #edf2ff; font-size: 0.875rem; }
    .mobile-radius-options button[aria-pressed="true"] { color: white; background: #244bd6; }
    .location-search { justify-self: end; }
    .search-panel { left: auto; right: 0; transform: none; }
}
</style>
