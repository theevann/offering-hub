<template>
  <main class="p3">
    <section class="wrap header">
      <p class="kicker">Proposition 3</p>
      <h1>Ribbon Timeline</h1>
      <p>Time-first exploration to plan the next days across groups and cities.</p>
      <PropositionNav />
    </section>

    <section class="wrap">
      <ExplorerFilters
        theme-class="tone"
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

    <section class="wrap timeline-wrap">
      <p v-if="loading" class="state">Loading offerings...</p>
      <p v-else-if="error" class="state error">{{ error }}</p>
      <p v-else-if="!filteredOfferings.length" class="state">No offering matches the current filters.</p>

      <ol v-else class="timeline">
        <li v-for="offering in filteredOfferings" :key="offering.id" class="event">
          <div class="dot" />
          <div class="content">
            <OfferingPreviewCard :offering="offering" />
          </div>
        </li>
      </ol>
    </section>
  </main>
</template>

<script setup>
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

</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;700&family=Prata&display=swap');

.p3 {
  --ink: #101934;
  min-height: 100vh;
  color: var(--ink);
  background:
    radial-gradient(circle at 0% 0%, #f4edff 0, transparent 35%),
    radial-gradient(circle at 100% 5%, #d2ffe8 0, transparent 35%),
    linear-gradient(180deg, #fbf7ff, #f6fbff);
  font-family: 'Chakra Petch', sans-serif;
}

.wrap {
  max-width: 1040px;
  margin: 0 auto;
  padding: 1.3rem 1rem;
}

.kicker {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 0.7rem;
  font-weight: 700;
}

h1 {
  margin: 0.35rem 0;
  font-family: 'Prata', serif;
  font-size: clamp(2rem, 4vw, 3rem);
}

.header p {
  margin: 0;
  max-width: 650px;
}

.tone {
  background: color-mix(in srgb, white 82%, #cce4ff 18%);
}

.timeline {
  list-style: none;
  margin: 0;
  padding: 0 0 0 0.55rem;
  border-left: 3px solid color-mix(in srgb, var(--ink) 20%, transparent);
  display: grid;
  gap: 0.9rem;
}

.event {
  position: relative;
  padding-left: 1.1rem;
}

.dot {
  position: absolute;
  left: -0.63rem;
  top: 0.48rem;
  width: 0.68rem;
  height: 0.68rem;
  border-radius: 50%;
  background: #00b0ff;
  box-shadow: 0 0 0 5px color-mix(in srgb, #00b0ff 20%, transparent);
}

.content {
  border-radius: 16px;
  padding: 0.9rem;
  border: 1px solid color-mix(in srgb, var(--ink) 18%, transparent);
  background: color-mix(in srgb, white 85%, transparent);
  display: grid;
  gap: 0.5rem;
}

.state {
  margin: 0;
}

.error {
  color: #9b0d2b;
}
</style>
