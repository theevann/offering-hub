<script setup>
import { addDays, dateKey, filterOfferings, formatDay, groupAgenda, isValidDateKey, offeringCoordinates, countOfferingsByDay } from '~/utils/exploreOfferings'

useSeoMeta({ title: 'Explore nearby — COIE' })
// Filter changes update the URL without resetting the page's scroll position.
definePageMeta({ scrollToTop: false })
const route = useRoute()
const router = useRouter()

// Query parameters keep searches shareable and preserve filters after opening details.
function queryValue(name, fallback = '') {
    return typeof route.query[name] === 'string' ? route.query[name] : fallback
}
const browsingMode = computed({
    get: () => ['services', 'marketplace'].includes(queryValue('mode')) ? queryValue('mode') : 'events',
    set: (mode) => updateQuery({ mode, category: undefined }),
})
const activeView = computed({
    get: () => queryValue('view') === 'map' ? 'map' : 'list',
    set: (view) => updateQuery({ view }),
})
const radiusKm = computed({
    get: () => [5, 10, 20, 50].includes(Number(queryValue('radius'))) ? Number(queryValue('radius')) : 10,
    set: (radius) => updateQuery({ radius }),
})
const category = computed({
    get: () => queryValue('category'),
    set: (value) => updateQuery({ category: value || undefined }),
})
const selectedTopic = computed({
    get: () => queryValue('topic'),
    set: (topic) => updateQuery({ topic: topic || undefined }),
})
const searchInput = ref(queryValue('q'))
watch(() => route.query.q, () => { searchInput.value = queryValue('q') })
const coordinates = computed(() => {
    const lat = queryValue('lat')
    const lng = queryValue('lng')
    if (!lat.trim() || !lng.trim()) return null
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null
    if (Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180) return null
    return { lat: Number(lat), lng: Number(lng) }
})
const locationName = computed(() => queryValue('name') || (coordinates.value ? 'Selected area' : 'Choose a location'))

// One timezone controls agenda grouping, card times, map filtering and the day strip.
const timezonePreference = computed({
    get: () => queryValue('timezone') === 'user' ? 'user' : 'location',
    set: (timezone) => updateQuery({ timezone }),
})
const { userTimezone, locationTimezone, loadingTimezone, timezoneError } = await useExploreTimezone(coordinates)
const timeZone = computed(() => timezonePreference.value === 'user'
    ? userTimezone.value : locationTimezone.value || 'UTC')
const currentInstant = useState('explore-current-instant', () => new Date().toISOString())
onMounted(() => { currentInstant.value = new Date().toISOString() })
const today = computed(() => dateKey(currentInstant.value, timeZone.value))
const selectedDate = computed({
    get: () => isValidDateKey(queryValue('date')) && queryValue('date') >= today.value ? queryValue('date') : today.value,
    set: (date) => { if (isValidDateKey(date)) updateQuery({ date }) },
})
const dateStrip = ref(null)
const datePicker = ref(null)
const canScrollDates = ref(false)
let dateResizeObserver

function updateDateScrollHint() {
    const strip = dateStrip.value
    if (!strip) return
    const hasMoreBelow = strip.scrollHeight - strip.scrollTop > strip.clientHeight + 2
    const hasMoreRight = strip.scrollWidth - strip.scrollLeft > strip.clientWidth + 2
    canScrollDates.value = hasMoreBelow || hasMoreRight
}
watch(dateStrip, (strip) => {
    dateResizeObserver?.disconnect()
    if (!strip) return
    dateResizeObserver = new ResizeObserver(updateDateScrollHint)
    dateResizeObserver.observe(strip)
    updateDateScrollHint()
}, { flush: 'post' })
onBeforeUnmount(() => dateResizeObserver?.disconnect())

function scrollToLaterDates() {
    const strip = dateStrip.value
    if (!strip) return
    const horizontal = strip.scrollWidth > strip.clientWidth
    strip.scrollBy({ left: horizontal ? strip.clientWidth * 0.8 : 0,
        top: horizontal ? 0 : strip.clientHeight * 0.8, behavior: 'smooth' })
}

function openDatePicker() {
    datePicker.value?.focus()
    datePicker.value?.showPicker?.()
}
const dateOptions = computed(() => {
    const start = new Date(`${today.value}T12:00:00Z`)
    // Clamp the day for shorter months (e.g. January 31 → April 30).
    const lastDayOfTargetMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 4, 0, 12))
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3,
        Math.min(start.getUTCDate(), lastDayOfTargetMonth.getUTCDate()), 12))
    const lastDate = end.toISOString().slice(0, 10)
    const days = []

    for (let date = today.value; date <= lastDate; date = addDays(date, 1)) {
        days.push({
            date,
            label: date === today.value ? 'Today' : formatDay(date, { weekday: 'short' }),
            number: date.slice(8),
            month: formatDay(date, { month: 'short' }),
        })
    }
    return days
})

// Reveal a selection made with the date picker or restored from the URL.
// Scroll only the strip, never the whole page.
watch([selectedDate, dateStrip, dateOptions], () => {
    const strip = dateStrip.value
    const button = strip?.querySelector('[aria-pressed="true"]')
    if (!button) return
    const stripBounds = strip.getBoundingClientRect()
    const buttonBounds = button.getBoundingClientRect()
    if (buttonBounds.top < stripBounds.top) strip.scrollTop += buttonBounds.top - stripBounds.top
    if (buttonBounds.bottom > stripBounds.bottom) strip.scrollTop += buttonBounds.bottom - stripBounds.bottom
    if (buttonBounds.left < stripBounds.left) strip.scrollLeft += buttonBounds.left - stripBounds.left
    if (buttonBounds.right > stripBounds.right) strip.scrollLeft += buttonBounds.right - stripBounds.right
    updateDateScrollHint()
}, { flush: 'post' })
const topics = ['Yoga', 'Breathwork', 'Music', 'Dance', 'Art']
const marketplaceTypes = [
    { label: 'All', value: '' },
    { label: 'Rentals', value: 'RENTAL' }, { label: 'Sales', value: 'SALE' },
]

function updateQuery(changes) {
    return router.replace({ query: { ...route.query, ...changes } })
}
function submitSearch() {
    updateQuery({ q: searchInput.value.trim() || undefined })
}
function resetFilters() {
    searchInput.value = ''
    updateQuery({ q: undefined, topic: undefined, category: undefined, date: undefined })
}
function selectSearchLocation(location) {
    updateQuery({ lat: location.lat, lng: location.lng, name: location.name })
}
function searchMapArea(center) {
    updateQuery({ lat: center.lat.toFixed(6), lng: center.lng.toFixed(6), name: 'Selected map area' })
}

const { offerings, loading, error, refresh } = useNearbyOfferings(coordinates, radiusKm)
const matchingOfferings = computed(() => filterOfferings(offerings.value, {
    mode: browsingMode.value, view: activeView.value, selectedDate: selectedDate.value,
    search: queryValue('q'), topic: browsingMode.value === 'events' ? selectedTopic.value : '',
    category: category.value, timeZone: timeZone.value,
}))
const dateMatchCounts = computed(() => {
    const allUpcomingMatches = filterOfferings(offerings.value, {
        mode: 'events', view: 'list', selectedDate: today.value, search: queryValue('q'),
        topic: selectedTopic.value, category: '', timeZone: timeZone.value,
    })
    return countOfferingsByDay(allUpcomingMatches, dateOptions.value.map((day) => day.date), timeZone.value)
})

const maxEventsPerDay = computed(() => Math.max(0, ...Object.values(dateMatchCounts.value)))

function dayEventStyle(date) {
    const count = dateMatchCounts.value[date] || 0
    // Scale against the busiest day in this search's three-month date strip.
    const intensity = maxEventsPerDay.value ? count / maxEventsPerDay.value : 0
    // Keep quiet days pale and give busy days a noticeably stronger blue.
    return { '--event-tint': count ? 0.04 + intensity ** 2 * 0.70 : 0 }
}

const visibleCount = ref(30)
watch(matchingOfferings, () => { visibleCount.value = 30 })
const agendaGroups = computed(() => groupAgenda(matchingOfferings.value.slice(0, visibleCount.value), selectedDate.value, timeZone.value))
const mappedOfferings = computed(() => matchingOfferings.value.filter(offeringCoordinates))
const resultsTitle = computed(() => {
    if (browsingMode.value === 'services') return 'Services nearby'
    if (browsingMode.value === 'marketplace') return 'Rentals & sales nearby'
    return `${activeView.value === 'map' ? 'On' : 'Upcoming from'} ${formatDay(selectedDate.value)}`
})
</script>

<template>
    <div class="explore-background">
        <main class="explore-page">
        <header class="explore-header">
            <NuxtLink to="/" class="wordmark" aria-label="COIE home">coie<span>.</span></NuxtLink>
            <LocationSearch :name="locationName" v-model:radius-km="radiusKm" @select="selectSearchLocation" />
            <div class="radius-selector" role="group" aria-label="Search radius">
                <button v-for="radius in [5, 10, 20, 50]" :key="radius" type="button"
                    :aria-pressed="radiusKm === radius" @click="radiusKm = radius">{{ radius }} km</button>
            </div>
        </header>

        <div class="title-row">
            <h1>Explore nearby</h1>
            <div class="mode-tabs" role="group" aria-label="Browse offerings">
                <button :aria-pressed="browsingMode === 'events'" @click="browsingMode = 'events'">Events</button>
                <button :aria-pressed="browsingMode === 'services'" @click="browsingMode = 'services'">Services</button>
                <button :aria-pressed="browsingMode === 'marketplace'" @click="browsingMode = 'marketplace'">Rentals & sales</button>
            </div>
        </div>

        <section class="search-controls" aria-label="Search and filters">
            <div class="filter-row">
                <!-- Topics currently match keywords; they do not assume LLM tags exist. -->
                <div v-if="browsingMode === 'events'" class="chips" role="group" aria-label="Topics">
                    <button :aria-pressed="!selectedTopic" @click="selectedTopic = ''">All topics</button>
                    <button v-for="topic in topics" :key="topic" :aria-pressed="selectedTopic === topic.toLowerCase()"
                        @click="selectedTopic = selectedTopic === topic.toLowerCase() ? '' : topic.toLowerCase()">{{ topic }}</button>
                </div>
                <div v-else-if="browsingMode === 'marketplace'" class="chips" role="group" aria-label="Offering type">
                    <button v-for="type in marketplaceTypes" :key="type.value" :aria-pressed="category === type.value" @click="category = type.value">{{ type.label }}</button>
                </div>
                <button v-if="queryValue('q') || selectedTopic || category || queryValue('date')"
                    class="reset-button" type="button" aria-label="Reset filters" title="Reset filters" @click="resetFilters">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M3 11a9 9 0 1 1 2.6 7.4M3 4v7h7" />
                    </svg>
                </button>
            </div>
            <form class="search-form" role="search" @submit.prevent="submitSearch">
                <div class="search-row">
                    <input id="offering-search" v-model="searchInput" type="search" aria-label="Search nearby offerings"
                        :placeholder="browsingMode === 'events' ? 'Aerial yoga, live music…' : 'Search nearby offerings…'">
                    <button class="primary-button" type="submit">Search</button>
                </div>
            </form>
        </section>

        <div class="browse-layout" :class="{ 'with-date-rail': browsingMode === 'events' }">
            <aside v-if="browsingMode === 'events'" class="date-rail" aria-label="Agenda starting date">
                <div class="date-rail-heading">
                    <h2>From</h2>
                    <div class="date-picker-control">
                        <button type="button" class="calendar-button" aria-label="Pick a starting date" @click="openDatePicker">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
                                <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18" />
                            </svg>
                        </button>
                        <input ref="datePicker" v-model="selectedDate" class="compact-date-input" type="date" :min="today" aria-label="Pick a starting date">
                    </div>
                </div>
                <div class="date-strip-wrapper" :class="{ 'has-more-dates': canScrollDates }">
                    <div ref="dateStrip" class="date-strip" role="group" aria-label="Dates for the next three months" tabindex="0" @scroll.passive="updateDateScrollHint">
                        <button v-for="day in dateOptions" :key="day.date" :aria-pressed="selectedDate === day.date"
                            :class="{ 'has-events': dateMatchCounts[day.date] > 0 }"
                            :style="dayEventStyle(day.date)"
                            :title="`${dateMatchCounts[day.date] || 0} matching events`"
                            :aria-label="`Show from ${formatDay(day.date)}${dateMatchCounts[day.date] ? `, ${dateMatchCounts[day.date]} offerings on this day` : ''}`" @click="selectedDate = day.date">
                            <span class="day-label">{{ day.label }}<small>{{ day.month }}</small></span>
                            <strong>{{ day.number }}</strong>
                        </button>
                    </div>
                    <button v-if="canScrollDates" type="button" class="later-dates" aria-label="Scroll to later dates" @click="scrollToLaterDates">
                        <span aria-hidden="true">⌄</span>
                    </button>
                </div>
            </aside>

            <section class="results" aria-labelledby="results-heading">
                <div class="results-toolbar">
                    <div>
                        <h2 id="results-heading">{{ resultsTitle }}
                            <TimezoneSelector v-if="browsingMode === 'events'" v-model="timezonePreference"
                            :location-timezone="locationTimezone" :user-timezone="userTimezone" :loading="loadingTimezone" />
                        </h2>
                        <p v-if="coordinates" class="muted result-count" role="status">{{ loading ? 'Searching…' : `${matchingOfferings.length} matching offerings` }}</p>
                    </div>
                    <div class="view-switch" role="group" aria-label="Results view">
                        <button :aria-pressed="activeView === 'list'" @click="activeView = 'list'">{{ browsingMode === 'events' ? 'Agenda' : 'List' }}</button>
                        <button :aria-pressed="activeView === 'map'" @click="activeView = 'map'">Map</button>
                    </div>
                </div>
                <!-- <label v-if="browsingMode === 'events' && activeView === 'map'" class="map-date">On
                    <input v-model="selectedDate" type="date" :min="today">
                </label> -->

                <p v-if="timezoneError && timezonePreference === 'location'" class="muted" role="status">Location timezone unavailable; times are temporarily shown in UTC. You can select your timezone above.</p>
                <div v-if="!coordinates" class="empty-state">
                    <h3>Start with a place</h3>
                    <p>Choose your current location to find offerings nearby.</p>
                    <NuxtLink to="/" class="primary-link">Choose a location</NuxtLink>
                </div>
                <!-- Keep the map mounted while fetching: removing it collapses the page
                     and clamps the scroll position, even when router scrolling is disabled. -->
                <div v-else-if="activeView === 'map'" class="map-results" :aria-busy="loading">
                    <ClientOnly><OfferingMap :offerings="mappedOfferings" :center="coordinates" :time-zone="timeZone" :show-time="browsingMode === 'events'" :selected-date="selectedDate" @search-area="searchMapArea" /></ClientOnly>
                    <div v-if="loading || error" class="map-status" role="status">
                        <span>{{ error || 'Finding nearby offerings…' }}</span>
                        <button v-if="error" @click="refresh">Try again</button>
                    </div>
                    <p v-if="matchingOfferings.length !== mappedOfferings.length" class="muted">{{ matchingOfferings.length - mappedOfferings.length }} offerings have no map coordinates.</p>
                </div>
                <div v-else-if="loading" class="empty-state" role="status">Finding nearby offerings…</div>
                <div v-else-if="error" class="empty-state" role="alert"><p>{{ error }}</p><button @click="refresh">Try again</button></div>
                <template v-else>
                    <div v-if="!matchingOfferings.length" class="empty-state">
                        <h3>No matches nearby</h3>
                        <p>Try another search, a wider radius, or different filters.</p>
                        <button @click="resetFilters">Reset filters</button>
                    </div>
                    <template v-else-if="browsingMode === 'events'">
                        <section v-for="group in agendaGroups" :key="group.date" class="agenda-day">
                            <h3>{{ group.date === 'undated' ? 'Date to be confirmed' : formatDay(group.date) }}</h3>
                            <OfferingCard v-for="offering in group.offerings" :key="offering.id" :offering="offering" :time-zone="timeZone" :selected-date="selectedDate" />
                        </section>
                    </template>
                    <div v-else class="marketplace-list">
                        <OfferingCard v-for="offering in matchingOfferings.slice(0, visibleCount)" :key="offering.id" :offering="offering" :time-zone="timeZone" :show-time="false" />
                    </div>
                    <button v-if="activeView === 'list' && visibleCount < matchingOfferings.length" class="show-more" @click="visibleCount += 30">Show more {{ browsingMode === 'events' ? 'upcoming' : 'offerings' }}</button>
                </template>
            </section>
        </div>
        </main>
    </div>
</template>

<style scoped>
.explore-background {
    min-height: 100svh;
    background: #f8faff;
}

.explore-page {
    --blue: #244bd6;
    --ink: #182e55;
    max-width: 1280px;
    min-height: 100svh;
    margin: auto;
    padding: 1rem clamp(1rem, 4vw, 3rem) 3rem;
    background: #f8faff;
    color: var(--ink);
    font-family: Arial, Helvetica, sans-serif;
}

h1, h2, h3, p {
    margin: 0;
}

h1 {
    font-size: 1.7rem;
    font-weight: 600;
    letter-spacing: -0.04em;
}

h2 {
    font-size: 1.15rem;
    font-weight: 600;
}

.title-row, .results-toolbar, .filter-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
}

.explore-header {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 1rem;
}

.wordmark {
    color: var(--ink);
    font-size: 2rem;
    font-weight: 800;
    letter-spacing: -0.1rem;
    text-decoration: none;
}

.wordmark span, .location-link {
    color: var(--blue);
}

.location-link {
    font-weight: 600;
    text-underline-offset: 0.25rem;
}

label {
    display: grid;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: #59677e;
}

button, input, select {
    font: inherit;
}

button {
    min-height: 2.75rem;
    padding: 0.6rem 1rem;
    border: 1px solid #cbd6e8;
    border-radius: 0.5rem;
    background: white;
    color: var(--ink);
    cursor: pointer;
    font-size: 0.9375rem;
}

button:hover {
    background: #edf2ff;
}

button[aria-pressed="true"], .primary-button, .primary-link {
    background: var(--blue);
    border-color: var(--blue);
    color: white;
}

input, select {
    min-width: 0;
    min-height: 2.75rem;
    padding: 0.7rem;
    border: 1px solid #b9c6e0;
    border-radius: 0.5rem;
    background: white;
    color: var(--ink);
    font-size: 1rem;
}

input:focus-visible, select:focus-visible, button:focus-visible, a:focus-visible {
    outline: 3px solid #6684ef;
    outline-offset: 3px;
}

.title-row {
    margin: 1.25rem 0 1rem;
}

.mode-tabs, .radius-selector {
    display: flex;
    gap: 0.25rem;
    padding: 0.25rem;
    background: #e9eef8;
    border-radius: 0.65rem;
}

.radius-selector {
    justify-self: end;
}

.radius-selector button, .mode-tabs button {
    border: 0;
    background: transparent;
    white-space: nowrap;
}

.radius-selector button[aria-pressed="true"], .mode-tabs button[aria-pressed="true"] {
    color: #244bd6;
    background: white;
    box-shadow: 0 1px 4px #182e5514;
}

.mode-tabs {
    flex: 1;
}

.mode-tabs button {
    flex: 1;
    font-weight: 600;
}

.search-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.25rem;
}

.search-row {
    display: flex;
    gap: 0.75rem;
}

.search-row input {
    flex: 1;
    padding: 0.7rem;
}

.filter-row {
    min-width: 0;
    flex-wrap: nowrap;
    justify-content: flex-start;
    gap: 0.5rem;
}

.chips {
    display: flex;
    flex-wrap: nowrap;
    overflow-x: auto;
    min-width: 0;
    scrollbar-width: none;
    gap: 0.35rem;
    padding: 0.2rem;
}

.chips button {
    flex-shrink: 0;
    white-space: nowrap;
    padding: 0.5rem 0.7rem;
    border-radius: 2rem;
}

.reset-button {
    display: grid;
    place-items: center;
    width: 2.75rem;
    padding: 0;
    flex-shrink: 0;
    border-color: transparent;
    background: transparent;
    color: var(--blue);
}

.browse-layout {
    margin-top: 1rem;
}

.with-date-rail {
    display: grid;
    grid-template-columns: 7rem minmax(0, 1fr);
    gap: 2rem;
}

.date-rail {
    align-self: start;
    position: sticky;
    top: 1rem;
}

.date-rail h2 {
    margin-bottom: 0;
    font-size: 0.9375rem;
}

.date-strip {
    display: grid;
    gap: 0.5rem;
    max-height: min(28rem, 60svh);
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
    scroll-snap-type: y proximity;
    padding: 0.25rem;
}

.date-strip::-webkit-scrollbar {
    display: none;
}

.date-strip:focus-visible {
    outline: 3px solid #6684ef;
    outline-offset: 3px;
}

.day-label {
    display: grid;
    gap: 0.15rem;
    text-align: left;
}

.day-label small {
    font-size: 0.75rem;
    font-weight: 400;
}

.date-strip button {
    scroll-snap-align: start;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
}

.date-strip strong {
    font-size: 1.2rem;
}

.date-strip button.has-events:not([aria-pressed="true"]) {
    background: linear-gradient(rgb(36 75 214 / var(--event-tint)), rgb(36 75 214 / var(--event-tint))), white;
    border-color: #c5d6f7;
}

.date-strip button.has-events:not([aria-pressed="true"]):hover {
    border-color: var(--blue);
}

.results {
    min-width: 0;
}

.results-toolbar {
    margin-bottom: 0.6rem;
}

.muted {
    color: #59677e;
    font-size: 0.875rem;
    line-height: 1.6;
}

.map-results {
    position: relative;
    min-height: max(65vh, 24rem);
}

.map-status {
    position: absolute;
    bottom: 2.5rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    max-width: calc(100% - 2rem);
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    background: white;
    box-shadow: 0 2px 10px #182e5520;
    font-size: 0.875rem;
}

.view-switch {
    display: flex;
    gap: 0.25rem;
    padding: 0.25rem;
    background: #e9eef8;
    border-radius: 0.65rem;
}

.view-switch button {
    border: 0;
    background: transparent;
}

.view-switch button[aria-pressed="true"] {
    color: var(--blue);
    background: white;
    box-shadow: 0 1px 4px #182e5514;
}

.agenda-day, .marketplace-list {
    display: grid;
    gap: 0.5rem;
}

.agenda-day {
    margin-bottom: 1.25rem;
}

.agenda-day > h3 {
    padding: 0.5rem 0;
    font-size: 0.875rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #59677e;
}

.empty-state {
    display: grid;
    justify-items: center;
    gap: 1rem;
    padding: 3rem 1.5rem;
    text-align: center;
    border: 1px solid #dce4f1;
    border-radius: 1rem;
    background: white;
    margin-bottom: 1rem;
}

.empty-state p {
    color: #59677e;
    line-height: 1.6;
}

.primary-link {
    padding: 0.8rem 1rem;
    border-radius: 0.5rem;
    text-decoration: none;
}

.map-date {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
}

.show-more {
    display: block;
    margin: 2rem auto;
}

.chips::-webkit-scrollbar { display: none; }
.date-rail-heading { display: flex; justify-content: space-around; align-items: center; margin-bottom: 0.5rem; }
.date-picker-control { position: relative; width: 2.25rem; height: 2.25rem; }
.calendar-button { display: grid; place-items: center; min-height: 2.25rem; width: 2.25rem; padding: 0; }
.compact-date-input { position: absolute; inset: 0; opacity: 0; pointer-events: none; width: 100%; min-width: 0; }
.date-picker-control:focus-within { outline: 3px solid #6684ef; outline-offset: 3px; border-radius: 0.5rem; }
.date-strip-wrapper { position: relative; }
.has-more-dates::after { content: ''; position: absolute; pointer-events: none; bottom: 0; left: 0; right: 0; height: 2rem; background: linear-gradient(transparent, #f8faff); }
.later-dates { position: absolute; z-index: 1; bottom: -0.7rem; left: calc(50% - 1rem); display: grid; place-items: center; width: 2rem; min-height: 1.75rem; padding: 0; border-radius: 2rem; color: #244bd6; background: white; }
.results-toolbar > div:first-child { flex: 1; min-width: 0; }
.result-count { margin-top: 0.15rem; }

@media(max-width: 700px) {
    .explore-page { padding: 0.6rem 1rem 2rem; }
    .explore-header { grid-template-columns: auto minmax(0, 1fr); }
    .explore-header > .radius-selector { display: none; }
    .title-row { margin: 0.6rem 0; gap: 0.5rem; }
    .title-row > h1 { display:none; }
    h1 { font-size: 1rem; font-weight: 500; color: #59677e; }
    .mode-tabs { flex-basis: 100%; width: 100%; }
    .mode-tabs button { padding: 0.5rem 0.4rem; font-size: 0.875rem; }
    .search-controls { grid-template-columns: minmax(0, 1fr); gap: 0.5rem; margin-bottom: 0.75rem; }
    .search-form { grid-row: 1; }
    .search-row { gap: 0.4rem; }
    .chips { width: 100%; }
    .chips button { font-size: 0.875rem; }
    .browse-layout { margin-top: 0; }
    .with-date-rail { grid-template-columns: minmax(0, 1fr); gap: 1rem; }
    .date-rail { position: static; min-width: 0; }
    .date-rail-heading { margin-bottom: 0.2rem; justify-content: space-between; }
    .date-strip { display: flex; max-height: none; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x proximity; padding: 0.25rem 0.25rem 0.5rem; }
    .date-strip button { flex: 0 0 3.5rem; flex-direction: column; gap: 0.1rem; padding: 0.4rem; }
    .day-label { text-align: center; }
    .day-label small { font-size: 0.65rem; }
    .has-more-dates::after { top: 0; bottom: 0; left: auto; width: 2rem; height: auto; background: linear-gradient(to right, transparent, #f8faff); }
    .later-dates { left: auto; right: -0.6rem; bottom: calc(50% - 0.9rem); transform: rotate(-90deg); }
    .results-toolbar { flex-wrap: nowrap; align-items: start; gap: 0.5rem; }
    h2 { font-size: 1rem; }
    .view-switch button { padding: 0.5rem 0.6rem; font-size: 0.875rem; }
    .map-date { margin-bottom: 0.5rem; }
}
</style>
