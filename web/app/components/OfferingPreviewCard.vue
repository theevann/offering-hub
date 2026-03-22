<template>
  <UCard class="offer-card" :style="accentStyle">
    <template #header>
      <div class="top">
        <UBadge color="neutral" variant="soft" :label="offering.category" />
        <span class="date">{{ formatDateRange(offering.startTime, offering.endTime) }}</span>
      </div>
    </template>

    <div class="body">
      <h3>{{ offering.title || 'Untitled offering' }}</h3>
      <p class="desc">{{ offering.description || 'No description yet.' }}</p>
    </div>

    <template #footer>
      <div class="meta">
        <a
          v-if="mapsUrl"
          :href="mapsUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="location-link"
        >
          <UBadge color="primary" variant="subtle" :label="offering.locationLabel" />
        </a>
        <UBadge v-else color="primary" variant="subtle" :label="offering.locationLabel" />
        <UBadge color="secondary" variant="subtle" :label="offering.priceLabel" />
        <UBadge color="neutral" variant="subtle" :label="offering.group?.name || 'Unknown group'" />
      </div>
    </template>
  </UCard>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  offering: {
    type: Object,
    required: true,
  },
})

const { formatDateRange } = useOfferingFormatters()
const { generateGoogleMapsUrl } = useOfferingExplorer()

const mapsUrl = computed(() => generateGoogleMapsUrl(props.offering))

const palette = {
  CLASS: ['#e6f4ff', '#bfe7ff'],
  WORKSHOP: ['#fff0dd', '#ffd8a3'],
  GATHERING: ['#e8ffeb', '#b8f3bf'],
  SERVICE: ['#f4ebff', '#dbc4ff'],
  SALE: ['#ffe9ef', '#ffc0d0'],
  OTHER: ['#eef1f6', '#d8dfea'],
}

const accentStyle = computed(() => {
  const [baseA, baseB] = palette[props.offering.category] || palette.OTHER
  return {
    '--card-a': baseA,
    '--card-b': baseB,
  }
})
</script>

<style scoped>
.offer-card {
  border-radius: 18px;
  background:
    radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--card-b) 45%, transparent), transparent 45%),
    linear-gradient(150deg, color-mix(in srgb, var(--card-a) 42%, white 58%), white);
  transition: transform 160ms ease, box-shadow 160ms ease;
}

.offer-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px color-mix(in srgb, currentColor 15%, transparent);
}

.top {
  display: flex;
  justify-content: space-between;
  gap: 0.45rem;
  align-items: center;
}

.date {
  font-size: 0.74rem;
  opacity: 0.75;
}

.body {
  display: grid;
  gap: 0.65rem;
}

h3 {
  margin: 0;
  font-size: 1rem;
  line-height: 1.25;
}

.desc {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.4;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.location-link {
  text-decoration: none;
  cursor: pointer;
  transition: transform 160ms ease;
}

.location-link:hover {
  transform: scale(1.05);
}

</style>
