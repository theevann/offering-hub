<template>
  <section class="filters" :class="themeClass">
    <div class="top-row">
      <UInput
        class="search"
        icon="i-lucide-search"
        :model-value="search"
        placeholder="Search title, description, city, group..."
        @update:model-value="emit('update:search', $event)"
      />
      <UButton color="neutral" variant="subtle" @click="showAdvanced = !showAdvanced">
        {{ showAdvanced ? 'Hide advanced' : 'Show advanced' }}
      </UButton>
      <UButton color="neutral" variant="outline" @click="emit('clear')">
        Reset {{ activeFilterCount ? `(${activeFilterCount})` : '' }}
      </UButton>
    </div>

    <div class="quick-row">
      <span class="chips-label">When</span>
      <UButton
      v-for="preset in datePresets"
      :key="preset.value"
      size="xs"
      color="neutral"
      :variant="datePreset === preset.value ? 'solid' : 'soft'"
      @click="emit('update:datePreset', preset.value)"
      >
      {{ preset.label }}
      </UButton>
    </div>
    <div class="quick-row">
      <span class="chips-label">Price</span>
      <UButton
        v-for="preset in pricingPresets"
        :key="preset.value"
        size="xs"
        color="neutral"
        :variant="pricingPreset === preset.value ? 'solid' : 'soft'"
        @click="emit('update:pricingPreset', preset.value)"
      >
        {{ preset.label }}
      </UButton>
    </div>

    <transition name="expand">
      <div v-if="showAdvanced" class="selectors">
        <div class="field">
          <span>Country</span>
          <USelect
            :items="countryItems"
            :model-value="country"
            @update:model-value="emit('update:country', $event)"
          />
        </div>

        <div class="field">
          <span>City</span>
          <USelect
            :items="cityItems"
            :model-value="city"
            @update:model-value="emit('update:city', $event)"
          />
        </div>

        <div class="field">
          <span>Group</span>
          <USelect
            :items="groupItems"
            :model-value="groupId"
            @update:model-value="emit('update:groupId', $event)"
          />
        </div>

        <div class="field">
          <span>Sort by</span>
          <USelect
            :items="sortItems"
            :model-value="sortBy"
            @update:model-value="emit('update:sortBy', $event)"
          />
        </div>
      </div>
    </transition>

    <div class="chips">
      <span class="chips-label">Categories</span>
      <UButton
        v-for="category in categoryOptions"
        :key="category"
        size="xs"
        color="primary"
        :variant="selectedCategories.includes(category) ? 'solid' : 'soft'"
        @click="emit('toggle-category', category)"
      >
        {{ category }}
        <UBadge color="neutral" variant="subtle" size="sm" :label="String(categoryFacetCounts[category] || 0)" />
      </UButton>
    </div>

    <div class="chips">
      <span class="chips-label">Pricing Type</span>
      <UButton
        v-for="pricing in pricingOptions"
        :key="pricing"
        size="xs"
        color="neutral"
        :variant="selectedPricingTypes.includes(pricing) ? 'solid' : 'soft'"
        @click="emit('toggle-pricing', pricing)"
      >
        {{ pricing }}
        <UBadge color="neutral" variant="subtle" size="sm" :label="String(pricingFacetCounts[pricing] || 0)" />
      </UButton>
    </div>

    <div class="result-row">
      <UBadge
        color="neutral"
        variant="subtle"
        :label="`Showing ${resultCount} of ${totalCount} offerings`"
      />
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'

const showAdvanced = ref(false)

const props = defineProps({
  themeClass: { type: String, default: '' },
  search: { type: String, default: '' },
  country: { type: String, default: '' },
  city: { type: String, default: '' },
  groupId: { type: String, default: '' },
  datePreset: { type: String, default: 'all' },
  pricingPreset: { type: String, default: 'all' },
  sortBy: { type: String, default: 'soonest' },
  selectedCategories: { type: Array, default: () => [] },
  selectedPricingTypes: { type: Array, default: () => [] },
  categoryOptions: { type: Array, default: () => [] },
  pricingOptions: { type: Array, default: () => [] },
  countryOptions: { type: Array, default: () => [] },
  cityOptions: { type: Array, default: () => [] },
  groupOptions: { type: Array, default: () => [] },
  activeFilterCount: { type: Number, default: 0 },
  resultCount: { type: Number, default: 0 },
  totalCount: { type: Number, default: 0 },
  categoryFacetCounts: { type: Object, default: () => ({}) },
  pricingFacetCounts: { type: Object, default: () => ({}) },
})

const emit = defineEmits([
  'update:search',
  'update:country',
  'update:city',
  'update:groupId',
  'update:datePreset',
  'update:pricingPreset',
  'update:sortBy',
  'toggle-category',
  'toggle-pricing',
  'clear',
])

const datePresets = [
  { label: 'All', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: '7 days', value: 'week' },
  { label: '30 days', value: 'month' },
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'No date', value: 'undated' },
]

const pricingPresets = [
  { label: 'All', value: 'all' },
  { label: 'Has price', value: 'priced' },
  { label: 'Free', value: 'free' },
  { label: 'Donation', value: 'donation' },
  { label: 'Unknown', value: 'unknown' },
]

const sortItems = [
  { label: 'Soonest', value: 'soonest' },
  { label: 'Latest start date', value: 'latest' },
  { label: 'Newest ingested', value: 'newest' },
  { label: 'Title A-Z', value: 'title' },
]

const countryItems = computed(() => [
  { label: 'All', value: '' },
  ...props.countryOptions.map((item) => ({ label: item, value: item })),
])

const cityItems = computed(() => [
  { label: 'All', value: '' },
  ...props.cityOptions.map((item) => ({ label: item, value: item })),
])

const groupItems = computed(() => [
  { label: 'All', value: '' },
  ...props.groupOptions.map((group) => ({ label: group.name, value: group.id })),
])
</script>

<style scoped>
.filters {
  display: grid;
  gap: 0.9rem;
  padding: 1rem;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  background: color-mix(in srgb, white 90%, transparent);
}

.top-row {
  display: flex;
  gap: 0.6rem;
  align-items: center;
}

.search {
  flex: 1;
}

.quick-row,
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  align-items: center;
}

.chips-label {
  font-size: 0.85rem;
  opacity: 0.8;
  margin-right: 0.15rem;
}

.selectors {
  display: grid;
  gap: 0.65rem;
  grid-template-columns: repeat(4, minmax(120px, 1fr));
}

.field {
  display: grid;
  gap: 0.32rem;
}

.field span {
  font-size: 0.82rem;
}

.result-row {
  display: flex;
  align-items: center;
}

.expand-enter-active,
.expand-leave-active {
  transition: all 180ms ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 250px;
}

@media (max-width: 900px) {
  .selectors {
    grid-template-columns: repeat(2, minmax(120px, 1fr));
  }
}

@media (max-width: 760px) {
  .top-row {
    flex-wrap: wrap;
  }
}

@media (max-width: 520px) {
  .selectors {
    grid-template-columns: 1fr;
  }
}
</style>
