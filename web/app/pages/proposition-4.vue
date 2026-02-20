<template>
  <main class="p4">
    <section class="wrap head">
      <div>
        <p class="kicker">Proposition 4</p>
        <h1>City Signals</h1>
        <p>Location-first browsing with local stacks grouped by city and group source.</p>
      </div>
      <PropositionNav />
    </section>

    <section class="wrap">
      <ExplorerFilters
        theme-class="mint"
        :search="filters.search"
        :country="filters.country"
        :city="filters.city"
        :group-id="filters.groupId"
        :date-preset="filters.datePreset"
        :pricing-preset="filters.pricingPreset"
        :sort-by="filters.sortBy"
        :selected-categories="filters.categories"
        :selected-pricing-types="filters.pricingTypes"
        :category-options="categoryOptions"
        :pricing-options="pricingOptions"
        :country-options="countryOptions"
        :city-options="cityOptions"
        :group-options="groupOptions"
        :active-filter-count="activeFilterCount"
        :result-count="filteredOfferings.length"
        :total-count="totalOfferings"
        :category-facet-counts="categoryFacetCounts"
        :pricing-facet-counts="pricingFacetCounts"
        @update:search="filters.search = $event"
        @update:country="filters.country = $event"
        @update:city="filters.city = $event"
        @update:group-id="filters.groupId = $event"
        @update:date-preset="filters.datePreset = $event"
        @update:pricing-preset="filters.pricingPreset = $event"
        @update:sort-by="filters.sortBy = $event"
        @toggle-category="toggleCategory"
        @toggle-pricing="togglePricingType"
        @clear="clearFilters"
      />
    </section>

    <section class="wrap results">
      <p v-if="loading" class="state">Loading offerings...</p>
      <p v-else-if="error" class="state error">{{ error }}</p>
      <p v-else-if="!groupedByCity.length" class="state">No offering matches the current filters.</p>

      <section v-else class="city-grid">
        <article v-for="cityGroup in groupedByCity" :key="cityGroup.key" class="city-card">
          <header>
            <h2>{{ cityGroup.label }}</h2>
            <span>{{ cityGroup.items.length }} offerings</span>
          </header>

          <ul>
            <li v-for="offering in cityGroup.items" :key="offering.id">
              <OfferingPreviewCard :offering="offering" />
            </li>
          </ul>
        </article>
      </section>
    </section>
  </main>
</template>

<script setup>
import { computed } from 'vue'

const {
  loading,
  error,
  filters,
  filteredOfferings,
  categoryOptions,
  pricingOptions,
  countryOptions,
  cityOptions,
  groupOptions,
  activeFilterCount,
  totalOfferings,
  categoryFacetCounts,
  pricingFacetCounts,
  toggleCategory,
  togglePricingType,
  clearFilters,
} = useOfferingExplorer()

const groupedByCity = computed(() => {
  const buckets = new Map()

  for (const offering of filteredOfferings.value) {
    const city = offering.city || 'Unknown city'
    const country = offering.country || 'Unknown country'
    const key = `${city}__${country}`

    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        label: `${city}, ${country}`,
        items: [],
      })
    }

    buckets.get(key).items.push(offering)
  }

  return [...buckets.values()].sort((a, b) => b.items.length - a.items.length)
})
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=Brygada+1918:ital,wght@0,600;1,600&display=swap');

.p4 {
  --ink: #11312d;
  min-height: 100vh;
  color: var(--ink);
  background:
    radial-gradient(circle at 15% 0%, #d2ffe6 0, transparent 33%),
    radial-gradient(circle at 90% 7%, #ffeec0 0, transparent 35%),
    linear-gradient(180deg, #ecfff8, #fffdf4);
  font-family: 'Outfit', sans-serif;
}

.wrap {
  max-width: 1120px;
  margin: 0 auto;
  padding: 1.2rem 1rem;
}

.head {
  display: grid;
  gap: 0.75rem;
}

.kicker {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.7rem;
  font-weight: 700;
}

h1 {
  margin: 0.35rem 0;
  font-family: 'Brygada 1918', serif;
  font-size: clamp(2rem, 4vw, 3rem);
}

.head p {
  margin: 0;
  max-width: 680px;
}

.mint {
  background: color-mix(in srgb, white 82%, #d8fff3 18%);
}

.results {
  display: grid;
  gap: 1rem;
}

.city-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.9rem;
}

.city-card {
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--ink) 18%, transparent);
  background: color-mix(in srgb, white 84%, transparent);
  padding: 0.9rem;
  display: grid;
  gap: 0.75rem;
}

header {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: baseline;
}

header h2 {
  margin: 0;
  font-size: 1.05rem;
}

header span {
  font-size: 0.76rem;
  opacity: 0.75;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.65rem;
}

li {
  list-style: none;
}

.state {
  margin: 0;
}

.error {
  color: #8a1630;
}

@media (max-width: 980px) {
  .city-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .city-grid {
    grid-template-columns: 1fr;
  }
}
</style>
