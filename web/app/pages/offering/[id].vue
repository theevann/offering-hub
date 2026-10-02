<script setup>
import { dateKey, formatDay } from '~/utils/exploreOfferings'
import { offeringTimeLabel, offeringDateRange, offeringPriceLabel, offeringVenueLabel, offeringLocationNote, offeringDirectionsUrl } from '~/utils/offeringPresentation'
import { offeringResources, offeringPhotoUrl } from '~/utils/offeringLinks'

const route = useRoute()
const router = useRouter()
const lastExploreSearch = useState('last-explore-search', () => '')
const { data: offering, status, error, refresh } = await useFetch(() => `/api/offerings/${encodeURIComponent(route.params.id)}`)
useSeoMeta({ title: () => offering.value ? `${offering.value.title} — COIE` : 'Offering — COIE' })

const timeZone = computed(() => offering.value?.timeZone || 'UTC')
const isEvent = computed(() => !['SERVICE', 'RENTAL', 'SALE'].includes(offering.value?.category))
const categoryLabel = computed(() => offering.value?.category?.toLowerCase().replaceAll('_', ' '))
const dateLabel = computed(() => {
    if (!offering.value?.startTime) return 'Date to be confirmed'
    return offeringDateRange(offering.value, timeZone.value)
        || formatDay(dateKey(offering.value.startTime, timeZone.value), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
})
const resources = computed(() => offeringResources(offering.value?.resources))
const contactActions = computed(() => resources.value.filter(resource => !resource.purposes.includes('location') && !resource.purposes.includes('payment')))
const paymentActions = computed(() => resources.value.filter(resource => resource.purposes.includes('payment')))
const modes = computed(() => offering.value?.locationModes || ['unknown'])
const hasPhysicalDestination = computed(() => modes.value.includes('at_provider'))
const isOnlineOnly = computed(() => modes.value.length === 1 && modes.value[0] === 'online')
const locationActions = computed(() => hasPhysicalDestination.value ? resources.value.filter(resource => resource.purposes.includes('location') && !resource.purposes.includes('payment')) : [])
const photoDialog = ref(null)
function closePhotoOnBackdrop(event) {
    if (event.target === photoDialog.value) photoDialog.value.close()
}
const photoFailed = ref(false)
watch(() => route.params.id, () => { photoFailed.value = false })
const photo = computed(function () {
    return (offering.value?.media || [])
        .find(media => media.type?.toLowerCase() === 'image' && offeringPhotoUrl(media.url))
})
const directionsUrl = computed(() => offeringDirectionsUrl(offering.value))
const backLink = computed(() => {
    if (lastExploreSearch.value) return lastExploreSearch.value
    const item = offering.value
    if (item?.latitude != null && item?.longitude != null) {
        return { path: '/explore', query: { lat: item.latitude, lng: item.longitude, name: isOnlineOnly.value ? (item.group?.name || 'Community area') : (item.locationText || item.venue?.displayName || 'Selected area') } }
    }
    return '/'
})
function goBack(event) {
    // Browser Back restores the previous scroll position and mounted search state.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (lastExploreSearch.value && router.options.history.state.back === lastExploreSearch.value) {
        event.preventDefault()
        router.back()
    }
}
function actionDetail(value) {
    return value.replace(/^https?:\/\//i, '')
}

function updatedLabel(value) {
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: timeZone.value }).format(new Date(value))
}

</script>

<template>
    <div class="detail-background">
        <main class="detail-page">
            <header class="site-header">
                <NuxtLink to="/" class="wordmark" aria-label="COIE home">coie<span>.</span></NuxtLink>
                <span>Local discoveries. Real connections.</span>
            </header>
            <NuxtLink :to="backLink" class="back-link" @click="goBack">← {{ lastExploreSearch ? 'Back to results' : isOnlineOnly ? 'Explore this community’s area' : 'Explore nearby' }}</NuxtLink>

            <section v-if="status === 'pending'" class="state" role="status">Loading offering…</section>
            <section v-else-if="error || !offering" class="state" role="alert">
                <h1>{{ error?.statusCode === 404 ? 'Offering not found' : 'Unable to load this offering' }}</h1>
                <p>{{ error?.statusCode === 404 ? 'It may have been removed, or the link may be incorrect.' : 'Please try again in a moment.' }}</p>
                <button v-if="error?.statusCode !== 404" @click="refresh()">Try again</button>
            </section>
            <template v-else>
                <header class="offering-heading">
                    <div class="tags"><span class="category">{{ categoryLabel }}</span><span v-for="topic in offering.topics" :key="topic">{{ topic }}</span></div>
                    <h1>{{ offering.title }}</h1>
                    <a v-if="hasPhysicalDestination && offering.venue && directionsUrl" class="venue-line" :href="directionsUrl" target="_blank" rel="noopener noreferrer">
                        <svg class="pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
                            aria-hidden="true">
                            <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
                            <circle cx="12" cy="10" r="2.5" />
                        </svg> {{ offeringVenueLabel(offering) }}
                    </a>
                    <p v-else class="venue-line">{{ offeringVenueLabel(offering) }}</p>
                </header>
                <div class="detail-layout" :class="{ 'with-photo': photo && !photoFailed }">
                    <button v-if="photo && !photoFailed" class="photo-preview" type="button"
                        aria-label="Enlarge photo" @click="photoDialog.showModal()">
                        <img class="offering-photo" :src="offeringPhotoUrl(photo.url)" :alt="`Image for ${offering.title}`" @error="photoFailed = true">
                        <span>Enlarge photo ↗</span>
                    </button>
                    <div class="detail-content">
                        <div class="practical-details" aria-label="Practical details">
                        <section v-if="isEvent || offering.startTime">
                            <h2>{{ isEvent ? 'When' : 'Availability' }}</h2>
                            <p class="detail-value">{{ dateLabel }}</p>
                            <p v-if="offering.startTime">{{ offeringTimeLabel(offering, timeZone) }}</p>
                            <!-- <small v-if="offering.startTime">({{ timeZone }})</small> -->
                        </section>
                        <section>
                            <h2>Where</h2>
                            <p class="detail-value">
                                <a v-if="directionsUrl && !offering.venue?.address" :href="directionsUrl" target="_blank" rel="noopener noreferrer">{{ offeringVenueLabel(offering) }}</a>
                                <template v-else>{{ offeringVenueLabel(offering) }}</template>
                            </p>
                            <p v-if="hasPhysicalDestination && offering.venue?.address">
                                <a v-if="directionsUrl" :href="directionsUrl" target="_blank" rel="noopener noreferrer">{{ offering.venue.address }}</a>
                                <template v-else>{{ offering.venue.address }}</template>
                            </p>
                            <p v-for="resource in locationActions" :key="resource.value">
                                <a v-if="resource.href" :href="resource.href" target="_blank" rel="noopener noreferrer">Get directions</a>
                                <span v-else>{{ resource.value }}</span>
                            </p>
                            <p v-if="offeringLocationNote(offering)" class="muted">{{ offeringLocationNote(offering) }}</p>
                        </section>
                        <section><h2>Price</h2><p class="detail-value">{{ offeringPriceLabel(offering) }}</p></section>
                        </div>
                        <section class="description-section">
                            <h2>About this offering</h2>
                            <p class="description">{{ offering.description || 'No description was provided. Check the original message below for details.' }}</p>
                        </section>
                        <section v-if="contactActions.length" class="contact-actions" aria-label="Booking and contact">
                            <template v-for="resource in contactActions" :key="`${resource.channel}:${resource.value}`">
                                <a v-if="resource.href" class="contact-action" :class="{ 'primary-action': resource.purposes.includes('booking') }"
                                    :href="resource.href" :title="resource.value" target="_blank" rel="noopener noreferrer">
                                    <span>{{ resource.label }}</span>
                                    <small>{{ actionDetail(resource.value) }}</small>
                                </a>
                                <p v-else>{{ resource.value }}</p>
                            </template>
                        </section>
                        <section v-if="paymentActions.length" class="payment-section" aria-label="Payment">
                            <h2>Payment</h2>
                            <div class="contact-actions">
                                <template v-for="resource in paymentActions" :key="`${resource.channel}:${resource.value}`">
                                    <a v-if="resource.href" class="contact-action" :href="resource.href" target="_blank" rel="noopener noreferrer">
                                        <span>{{ resource.label }}</span>
                                        <small>{{ actionDetail(resource.value) }}</small>
                                    </a>
                                    <p v-else>{{ resource.value }}</p>
                                </template>
                            </div>
                        </section>
                    </div>
                </div>
                <dialog v-if="photo && !photoFailed" ref="photoDialog" class="photo-dialog" aria-label="Enlarged offering photo"
                    @click="closePhotoOnBackdrop">
                    <button class="close-photo" type="button" autofocus @click="photoDialog.close()">Close ✕</button>
                    <img :src="offeringPhotoUrl(photo.url)" :alt="`Image for ${offering.title}`">
                </dialog>
                <details :key="offering.id" id="original-message" class="source-section">
                    <summary>Original message<template v-if="offering.rawMessages?.length > 1">s ({{ offering.rawMessages.length }})</template></summary>
                    <p class="muted"><template v-if="offering.group?.name">Shared in {{ offering.group.name }} · </template>Updated {{ updatedLabel(offering.updatedAt) }}</p>
                    <template v-if="offering.rawMessages?.length">
                        <blockquote v-for="msg in offering.rawMessages" :key="msg.id">{{ msg.rawText || '(Image attached)' }}</blockquote>
                    </template>
                    <p v-else class="muted">The original message is unavailable.</p>
                </details>
            </template>
        </main>
    </div>
</template>

<style scoped>
.venue-line {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}
.pin {
    width: 1.25rem;
    height: 1.25rem;
    flex-shrink: 0;
}
.detail-background {
    min-height: 100svh;
    background: #f8faff;
    color: #182e55;
    font-family: Arial, Helvetica, sans-serif;
}
.detail-page {
    max-width: 1120px;
    margin: auto;
    padding: 1.25rem clamp(1rem, 4vw, 3rem) 4rem;
}
.site-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
}
.site-header > span, .muted, small {
    color: #59677e;
}
.wordmark {
    font-size: 2rem;
    font-weight: 800;
    letter-spacing: -0.1rem;
    text-decoration: none;
    color: #182e55;
}
.wordmark span, a {
    color: #244bd6;
}
a {
    text-underline-offset: 0.2em;
}
a:hover {
    text-decoration: underline;
}
a:focus-visible, button:focus-visible {
    outline: 3px solid #6684ef;
    outline-offset: 4px;
}
.back-link {
    display: inline-block;
    margin-bottom: 1.75rem;
}
h1, h2, p {
    margin: 0;
}
h1 {
    font-size: clamp(1.8rem, 4vw, 2.8rem);
    line-height: 1.15;
    letter-spacing: -0.04em;
    margin: 0.7rem 0;
}
h2 {
    font-size: 1.1rem;
    font-weight: 600;
    margin-bottom: 0.75rem;
}
p {
    line-height: 1.65;
}
.offering-heading {
    margin-bottom: 2rem;
}
.tags {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    font-size: 0.8125rem;
}
.tags span {
    padding: 0.3rem 0.6rem;
    border-radius: 1rem;
    background: #e7eeff;
}
.category {
    text-transform: capitalize;
}
.detail-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.5rem;
    align-items: start;
}
.detail-layout.with-photo {
    grid-template-columns: minmax(0, 1fr) minmax(0, 3fr);
}
.detail-content {
    display: grid;
    gap: 1.25rem;
    min-width: 0;
}
.photo-preview {
    padding: 0;
    overflow: hidden;
    background: white;
    color: #244bd6;
    cursor: zoom-in;
}
.offering-photo {
    display: block;
    width: 100%;
    max-height: 22rem;
    object-fit: contain;
    background: #edf2fb;
}
.photo-preview span {
    display: block;
    padding: 0.6rem;
    font-size: 0.8125rem;
}
.practical-details {
    display: grid;
    /* grid-template-columns: repeat(3, minmax(0, 1fr)); */
    grid-template-columns: minmax(0, 2fr) minmax(0, 2fr) minmax(0, 1fr);
    gap: 1.25rem;
    padding: 1.25rem;
    border: 1px solid #dce4f1;
    border-radius: 0.8rem;
    background: white;
    overflow-wrap: anywhere;
}
.practical-details h2 {
    color: #59677e;
    font-size: 0.8125rem;
    margin-bottom: 0.4rem;
}
.detail-value {
    font-weight: 600;
}
.contact-actions {
    display: flex;
    align-items: stretch;
    gap: 0.6rem;
    overflow-x: auto;
    padding: 0.25rem;
}
.contact-actions > * {
    flex-shrink: 0;
}
.contact-action, button {
    padding: 0.7rem 0.9rem;
    border-radius: 0.5rem;
    border: 1px solid #cbd6e8;
    text-align: center;
    font: inherit;
}
.contact-action {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.3rem;
    background: white;
    color: #244bd6;
    white-space: nowrap;
    text-decoration: none;
}
.contact-action small {
    display: block;
    max-width: 13rem;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #59677e;
    font-size: 0.75rem;
}
.contact-action:hover {
    background: #edf2ff;
    text-decoration: none;
}
.contact-action.primary-action {
    background: #244bd6;
    border-color: #244bd6;
    color: white;
}
.primary-action > span {
    font-weight: 600;
}
.primary-action small {
    color: white;
}
.contact-action.primary-action:hover {
    background: #1c3caf;
    border-color: #1c3caf;
}
.photo-dialog {
    position: fixed;
    inset: 0;
    margin: auto;
    width: fit-content;
    max-width: 94vw;
    max-height: 94svh;
    padding: 3.5rem 0.75rem 0.75rem;
    border: 0;
    border-radius: 0.75rem;
    background: white;
}
.photo-dialog::backdrop {
    background: rgb(10 20 40 / 75%);
}
.photo-dialog img {
    display: block;
    max-width: 88vw;
    max-height: 80svh;
    object-fit: contain;
}
.close-photo {
    position: absolute;
    top: 0.5rem;
    right: 0.75rem;
    background: white;
    color: #182e55;
    cursor: pointer;
}
.description, blockquote {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.75;
}
.source-section {
    grid-column: 1;
    width: 100%;
    border-top: 1px solid #dce4f1;
    margin-top: 2rem;
    padding-top: 1rem;
    scroll-margin-top: 1rem;
    color: #59677e;
    font-size: 0.8125rem;
}
.source-section summary {
    width: fit-content;
    cursor: pointer;
}
.source-section summary:hover {
    color: #244bd6;
}
.source-section summary:focus-visible {
    outline: 3px solid #6684ef;
    outline-offset: 4px;
}
.source-section[open] summary {
    margin-bottom: 0.75rem;
}
blockquote {
    margin: 1rem 0 0;
    padding: 1rem 1.25rem;
    background: transparent;
    border-left: 2px solid #dce4f1;
    border-radius: 0 0.5rem 0.5rem 0;
    font-size: 0.875rem;
}
.state {
    padding: 3rem 0;
}
.state button {
    margin-top: 1rem;
    cursor: pointer;
}
@media (max-width: 700px) {
    .site-header > span {
        display: none;
    }
    .detail-layout {
        gap: 1rem;
    }
    .detail-content {
        display: contents;
    }
    .practical-details, .contact-actions, .payment-section {
        grid-column: 1 / -1;
    }
    .practical-details {
        grid-row: 1;
        grid-template-columns: 1fr;
        gap: 1rem;
    }
    .offering-heading {
        margin-bottom: 1.5rem;
    }
}
</style>
