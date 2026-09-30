<script setup>
import { offeringTimeLabel, offeringDateRange, offeringPriceLabel, offeringVenueLabel } from '~/utils/offeringPresentation'

const props = defineProps({
    offering: { type: Object, required: true },
    timeZone: { type: String, required: true },
    showTime: { type: Boolean, default: true },
    selectedDate: { type: String, default: '' },
})
const timeLabel = computed(() => offeringTimeLabel(props.offering, props.timeZone, props.selectedDate))
const dateRange = computed(() => offeringDateRange(props.offering, props.timeZone))
const priceLabel = computed(() => offeringPriceLabel(props.offering))
const summary = computed(() => props.offering.summary || props.offering.description)
</script>

<template>
    <NuxtLink :to="`/offering/${offering.id}`" class="offering-card" :class="{ 'without-time': !showTime }">
        <div v-if="showTime" class="time">{{ timeLabel }}</div>
        <div class="content">
            <h3>{{ offering.title }}</h3>
            <p class="venue">{{ offeringVenueLabel(offering) }}
                <span v-if="offering.distanceKm != null"> · {{ Number(offering.distanceKm).toFixed(1) }} km</span>
            </p>
            <p v-if="offering.locationSource === 'GROUP_FALLBACK'" class="location-note">Approximate location</p>
            <p v-if="dateRange">{{ dateRange }}</p>
            <p v-if="summary" class="description">{{ summary }}</p>
        </div>
        <div class="metadata">
            <span class="price" :class="{ unspecified: priceLabel === 'Price not specified' }">{{ priceLabel }}</span>
            <span class="category">{{ offering.category?.toLowerCase().replaceAll('_', ' ') }}</span>
        </div>
    </NuxtLink>
</template>

<style scoped>
.offering-card {
    display: grid;
    grid-template-columns: 4.25rem minmax(0, 1fr) auto;
    align-items: start;
    gap: 1rem;
    padding: 1rem 1.15rem;
    border: 1px solid #dce4f1;
    border-radius: 0.65rem;
    background: white;
    color: #182e55;
    text-decoration: none;
}
.without-time { grid-template-columns: minmax(0, 1fr) auto; }
.offering-card:hover { border-color: #244bd6; background: #fcfdff; }
.offering-card:focus-visible { outline: 3px solid #6684ef; outline-offset: 3px; }
.time { font-weight: 700; color: #244bd6; font-size: 0.9375rem; }
.content { min-width: 0; }
h3 { margin: 0 0 0.3rem; font-size: 1rem; font-weight: 600; overflow-wrap: anywhere; }
p { margin: 0; color: #59677e; font-size: 0.875rem; line-height: 1.5; }
.description { margin-top: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.metadata { display: grid; gap: 0.3rem; justify-items: end; max-width: 11rem; font-size: 0.875rem; text-align: right; }
.category { color: #59677e; text-transform: capitalize; }
.unspecified { color: #69758a; }
@media (max-width: 600px) {
    .offering-card { grid-template-columns: 3.75rem minmax(0, 1fr); gap: 0.3rem 0.6rem; padding: 0.85rem; }
    .without-time { grid-template-columns: minmax(0, 1fr); }
    .metadata { grid-column: 2; display: flex; flex-wrap: wrap; gap: 0.3rem 0.6rem; max-width: none; justify-items: start; text-align: left; }
    .without-time .metadata { grid-column: 1; }
    .category::before { content: '· '; }
}
</style>
