<template>
  <main class="p1">
    <section class="hero wrap">
      <p class="eyebrow">Proposition 1</p>
      <h1>Aurora Mosaic</h1>
      <p class="subtitle">Editorial discovery with rich cards and fast visual scanning.</p>
      <PropositionNav />
      <div class="stats">
        <article>
          <strong>{{ stats.total }}</strong>
          <span>Total offerings</span>
        </article>
        <article>
          <strong>{{ stats.upcoming }}</strong>
          <span>Upcoming</span>
        </article>
        <article>
          <strong>{{ stats.priced }}</strong>
          <span>With price data</span>
        </article>
        <article>
          <strong>{{ stats.withLocation }}</strong>
          <span>With location context</span>
        </article>
      </div>
    </section>

    <section class="wrap body">
      <ExplorerFilters
        theme-class="glass"
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

      <p v-if="loading" class="state">Loading offerings...</p>
      <p v-else-if="error" class="state error">{{ error }}</p>
      <p v-else-if="!filteredOfferings.length" class="state">No offering matches the current filters.</p>

      <section v-else class="mosaic">
        <OfferingPreviewCard
          v-for="offering in filteredOfferings"
          :key="offering.id"
          :offering="offering"
        />
      </section>
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
  stats,
  toggleCategory,
  togglePricingType,
  clearFilters,
} = useOfferingExplorer()

</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=IBM+Plex+Sans:wght@400;500;600&display=swap');

.p1 {
  --ink: #1c1945;
  min-height: 100vh;
  color: var(--ink);
  background:
    radial-gradient(circle at 10% 15%, #ffd369 0, transparent 34%),
    radial-gradient(circle at 90% 4%, #71d8ff 0, transparent 35%),
    radial-gradient(circle at 84% 95%, #b0f7ba 0, transparent 30%),
    linear-gradient(160deg, #fff2df, #e8f0ff);
  font-family: 'IBM Plex Sans', sans-serif;
}

.wrap {
  max-width: 1150px;
  margin: 0 auto;
  padding: 1.4rem 1rem;
}

.hero {
  display: grid;
  gap: 0.8rem;
}

.eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.7rem;
  font-weight: 700;
}

h1 {
  margin: 0;
  font-family: 'Syne', sans-serif;
  font-size: clamp(2rem, 4vw, 3.3rem);
  line-height: 1;
}

.subtitle {
  margin: 0;
  max-width: 680px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
}

.stats article {
  border-radius: 16px;
  padding: 0.8rem;
  background: color-mix(in srgb, white 74%, transparent);
  border: 1px solid color-mix(in srgb, var(--ink) 16%, transparent);
  display: grid;
  gap: 0.2rem;
}

.stats strong {
  font-family: 'Syne', sans-serif;
  font-size: 1.45rem;
}

.stats span {
  font-size: 0.82rem;
}

.body {
  display: grid;
  gap: 1rem;
}

.glass {
  backdrop-filter: blur(6px);
}

.state {
  margin: 0;
}

.error {
  color: #a20f2b;
}

.mosaic {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

@media (max-width: 980px) {
  .stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .mosaic {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 650px) {
  .mosaic,
  .stats {
    grid-template-columns: 1fr;
  }
}
</style>
