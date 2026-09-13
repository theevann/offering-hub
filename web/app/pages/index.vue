<script setup>
useSeoMeta({
    title: 'COIE — Find your local community',
    description: 'Discover events, classes, and offerings around you. Choose a place to start exploring.',
})

const place = ref('')
const { locating, locationError, getCurrentLocation } = useBrowserLocation()
const error = ref('')
const selectedLocation = ref(null)

const locationResults = ref([])
const searching = ref(false)
const hasSearched = ref(false)
let searchRequest

async function choosePlace() {
    clearSelection()
    if (place.value.trim().length < 2) {
        error.value = 'Enter at least two characters to search for a city or town.'
        return
    }
    const controller = new AbortController()
    searchRequest = controller
    searching.value = true
    try {
        const results = await $fetch('/api/locations', {
            query: { q: place.value.trim() }, signal: controller.signal,
        })
        if (controller.signal.aborted) return
        locationResults.value = results
        hasSearched.value = true
    } catch (cause) {
        if (!controller.signal.aborted) {
            error.value = cause.data?.statusMessage || 'Unable to search locations. Please try again.'
        }
    } finally {
        if (!controller.signal.aborted) searching.value = false
    }
}

async function exploreLocation(location) {
    selectedLocation.value = location
    await navigateTo({ path: '/explore', query: {
        lat: location.lat, lng: location.lng, name: location.name,
    } })
}

async function useMyLocation() {
    clearSelection()
    const location = await getCurrentLocation()
    if (!location) {
        error.value = locationError.value
        return
    }
    await exploreLocation(location)
}

function clearSelection() {
    searchRequest?.abort()
    searching.value = false
    hasSearched.value = false
    locationResults.value = []
    selectedLocation.value = null
    error.value = ''
}

onBeforeUnmount(() => searchRequest?.abort())
</script>

<template>
    <div class="landing">
        <header class="site-header">
            <NuxtLink to="/" class="wordmark" aria-label="COIE home">coie<span>.</span></NuxtLink>
            <span class="header-note">A little closer to your community.</span>
        </header>

        <main class="main">
            <section class="intro" aria-labelledby="welcome-title">
                <p class="eyebrow">Good things happen nearby</p>
                <h1 id="welcome-title">Find your place.<br><span>See what’s happening.</span></h1>
                <p class="description">Classes, gatherings, and everyday offerings.<br class="desktop-break"> Discover
                    what your local community is sharing.</p>

                <form class="location-form" @submit.prevent="choosePlace">
                    <label for="place">Where would you like to explore?</label>
                    <div class="search-field">
                        <svg class="pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
                            aria-hidden="true">
                            <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
                            <circle cx="12" cy="10" r="2.5" />
                        </svg>
                        <input id="place" v-model="place" name="place" type="search"
                            placeholder="Town or city" autocomplete="off" maxlength="200"
                            :disabled="locating" :aria-invalid="Boolean(error)"
                            :aria-describedby="error ? 'location-error' : undefined" @input="clearSelection">
                        <button class="submit-button" type="submit" :disabled="locating || searching">{{ searching ? 'Searching…' : 'Find location' }} <span
                                aria-hidden="true">↗</span></button>
                    </div>

                    <div class="location-results" aria-live="polite" :aria-busy="searching">
                        <p v-if="searching" role="status">Looking for places…</p>
                        <p v-else-if="hasSearched && !locationResults.length">No places found. Try another spelling or a nearby town.</p>
                        <template v-if="locationResults.length">
                            <p style="margin-top: 0.5rem;">Choose your location:</p>
                            <ul aria-label="Matching places">
                                <li v-for="location in locationResults" :key="location.id">
                                    <button class="place-result" type="button" @click="exploreLocation(location)">
                                        <strong>{{ location.name }}</strong>
                                        <span>{{ location.description }}</span>
                                    </button>
                                </li>
                            </ul>
                            <small>Places: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> / <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a></small>
                        </template>
                    </div>

                    <div class="location-alternative">
                        <span class="or">or</span>
                        <button class="locate-button" type="button" :disabled="locating" @click="useMyLocation">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
                                aria-hidden="true">
                                <circle cx="12" cy="12" r="7" />
                                <circle cx="12" cy="12" r="2" />
                                <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
                            </svg>
                            {{ locating ? 'Finding your location…' : 'Use my location' }}
                        </button>
                        <p class="privacy-note">Your browser will ask for permission.</p>
                    </div>

                    <p v-if="error" id="location-error" class="error" role="alert">{{ error }}</p>
                    <div class="selection" role="status" aria-live="polite">
                        <p v-if="selectedLocation"><span aria-hidden="true">✓</span> Location selected: <strong>{{
                                selectedLocation.name }}</strong></p>
                        <p v-else-if="locating">Waiting for your browser’s location…</p>
                    </div>
                </form>
            </section>
        </main>

        <footer class="site-footer">
            <span>Local discoveries. Real connections.</span>
            <span>Start somewhere nearby.</span>
        </footer>
    </div>
</template>

<style scoped>
.location-results {
    text-align: left;
    font-size: 0.9375rem;
}
.location-results ul {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0;
    max-height: 18rem;
    overflow-y: auto;
    border: 1px solid #dce4f1;
    border-radius: 0.75rem;
    background: white;
}
.place-result {
    display: grid;
    gap: 0.25rem;
    width: 100%;
    padding: 0.85rem 1rem;
    border: 0;
    background: transparent;
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
}
.place-result:hover { background: #edf2ff; }
.place-result:focus-visible { outline: 3px solid #6684ef; outline-offset: -3px; }
.place-result span, .location-results small { color: #59677e; }
.location-results a { color: var(--blue); text-decoration: underline; }

.landing {
    --ink: #182e55;
    --blue: #244bd6;
    min-height: 100svh;
    display: flex;
    flex-direction: column;
    background: #f8faff;
    color: var(--ink);
    font-family: Arial, Helvetica, sans-serif;
}

.site-header,
.site-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.5rem clamp(1.25rem, 5vw, 5rem);
}

.wordmark {
    color: var(--ink);
    font-size: 2.25rem;
    font-weight: 800;
    letter-spacing: -0.15rem;
    text-decoration: none;
}

.wordmark span {
    color: var(--blue);
}

.header-note,
.site-footer {
    color: #59677e;
    font-size: 0.875rem;
}

.main {
    flex: 1;
    display: grid;
    place-items: center;
    padding: 4rem 1.25rem 3rem;
}

.intro {
    width: 100%;
    max-width: 54rem;
    text-align: center;
}

.eyebrow {
    margin: 0 0 1.5rem;
    color: var(--blue);
    font-size: 0.875rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
}

h1 {
    margin: 0;
    font-size: clamp(2.7rem, 6vw, 4.7rem);
    font-weight: 600;
    letter-spacing: -0.055em;
    line-height: 1.08;
}

h1 span {
    color: var(--blue);
}

.description {
    margin: 1.6rem 0 0;
    color: #59677e;
    font-size: 1.125rem;
    line-height: 1.7;
}

.location-form {
    max-width: 43rem;
    margin: 2.75rem auto 0;
}

label {
    display: block;
    margin-bottom: 0.75rem;
    text-align: left;
    font-size: 0.9375rem;
    font-weight: 600;
}

.search-field {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem;
    border: 1px solid #b9c6e0;
    border-radius: 1rem;
    background: white;
    box-shadow: 0 10px 35px #182e5508;
}

.search-field:focus-within {
    border-color: var(--blue);
    outline: 3px solid #244bd620;
}

.pin {
    width: 1.35rem;
    height: 1.35rem;
    margin-left: 0.6rem;
    flex-shrink: 0;
    color: #617499;
}

input {
    min-width: 0;
    width: 100%;
    padding: 0.85rem 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 1rem;
}

input::placeholder {
    color: #64748b;
}

button {
    cursor: pointer;
    font: inherit;
}

button:disabled {
    cursor: wait;
    opacity: 0.65;
}

button:focus-visible,
a:focus-visible {
    outline: 3px solid #6684ef;
    outline-offset: 4px;
}

.submit-button {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-shrink: 0;
    padding: 1rem 1.15rem;
    border: 0;
    border-radius: 0.65rem;
    background: var(--blue);
    color: white;
    font-size: 0.9375rem;
    font-weight: 600;
}

.submit-button:hover:not(:disabled) {
    background: #193ab4;
}

.submit-button span {
    font-size: 1.25rem;
}

.location-alternative {
    margin-top: 1.25rem;
}

.or {
    display: block;
    color: #64748b;
    font-size: 0.875rem;
    margin-bottom: 0.8rem;
}

.locate-button {
    display: inline-flex;
    gap: 0.5rem;
    align-items: center;
    min-height: 2.75rem;
    padding: 0.5rem 0.75rem;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    color: var(--blue);
    font-weight: 600;
}

.locate-button:hover:not(:disabled) {
    background: #eaf0ff;
}

.locate-button svg {
    width: 1.2rem;
    height: 1.2rem;
}

.privacy-note {
    margin: 0.35rem 0 0;
    color: #64748b;
    font-size: 0.875rem;
}

.error {
    margin: 1rem 0 0;
    color: #a12727;
    font-size: 0.9375rem;
}

.selection {
    min-height: 3.5rem;
    padding-top: 1rem;
    font-size: 0.9375rem;
    overflow-wrap: anywhere;
}

.selection p {
    margin: 0;
}

.selection span {
    color: var(--blue);
    margin-right: 0.3rem;
}

.site-footer {
    flex-wrap: wrap;
    border-top: 1px solid #e1e7f2;
}

@media (max-width: 600px) {
    .site-header {
        padding-top: 1rem;
    }

    .header-note {
        max-width: 10rem;
        text-align: right;
        line-height: 1.5;
    }

    .main {
        padding-top: 2.5rem;
    }

    .eyebrow {
        font-size: 0.875rem;
        letter-spacing: 0.08em;
    }

    .description {
        font-size: 1rem;
    }

    .desktop-break {
        display: none;
    }

    .location-form {
        margin-top: 2rem;
    }

    .search-field {
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    input {
        width: calc(100% - 3rem);
        flex: 1;
    }

    .submit-button {
        width: 100%;
        justify-content: center;
    }

    .site-footer {
        justify-content: center;
        text-align: center;
    }

    .site-footer span:last-child {
        display: none;
    }
}
</style>
