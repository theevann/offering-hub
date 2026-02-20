<template>
  <main class="p5">
    <section class="wrap title">
      <p class="kicker">Proposition 5</p>
      <h1>Category Boards</h1>
      <p>Kanban-style columns to compare categories at a glance with full filter controls.</p>
      <PropositionNav />
    </section>

    <section class="wrap">
      <ExplorerFilters
        theme-class="paper"
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

    <section class="wrap">
      <p v-if="loading" class="state">Loading offerings...</p>
      <p v-else-if="error" class="state error">{{ error }}</p>
      <p v-else-if="!columns.length" class="state">No offering matches the current filters.</p>

      <div v-else class="board">
        <article v-for="column in columns" :key="column.category" class="column">
          <header>
            <h2>{{ column.category }}</h2>
            <span>{{ column.items.length }}</span>
          </header>

          <ul>
            <li v-for="offering in column.items" :key="offering.id">
              <OfferingPreviewCard :offering="offering" />
            </li>
          </ul>
        </article>
      </div>
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

const columns = computed(() => {
  const map = new Map()

  for (const category of categoryOptions.value) {
    map.set(category, [])
  }

  for (const offering of filteredOfferings.value) {
    if (!map.has(offering.category)) map.set(offering.category, [])
    map.get(offering.category).push(offering)
  }

  return [...map.entries()]
    .map(([category, items]) => ({ category, items }))
    .filter((column) => column.items.length > 0)
})
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;700;800&family=Playfair+Display:wght@600&display=swap');

.p5 {
  --ink: #2d1835;
  min-height: 100vh;
  color: var(--ink);
  background:
    radial-gradient(circle at 5% 0%, #ffd0bc 0, transparent 34%),
    radial-gradient(circle at 100% 8%, #e3dcff 0, transparent 38%),
    linear-gradient(180deg, #fff8f0, #f7f5ff);
  font-family: 'Kanit', sans-serif;
}

.wrap {
  max-width: 1240px;
  margin: 0 auto;
  padding: 1.2rem 1rem;
}

.title {
  display: grid;
  gap: 0.7rem;
}

.kicker {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 0.7rem;
  font-weight: 700;
}

h1 {
  margin: 0.2rem 0;
  font-family: 'Playfair Display', serif;
  font-size: clamp(2rem, 4vw, 3.1rem);
}

.title p {
  margin: 0;
  max-width: 720px;
}

.paper {
  background: color-mix(in srgb, white 84%, #f4deff 16%);
}

.board {
  display: grid;
  gap: 0.8rem;
  grid-auto-flow: column;
  grid-auto-columns: minmax(250px, 1fr);
  overflow-x: auto;
  padding-bottom: 0.2rem;
}

.column {
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--ink) 18%, transparent);
  background: color-mix(in srgb, white 86%, transparent);
  padding: 0.8rem;
  display: grid;
  gap: 0.75rem;
  align-content: start;
}

.column header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.column header h2 {
  margin: 0;
  font-size: 1rem;
}

.column header span {
  min-width: 1.7rem;
  text-align: center;
  border-radius: 999px;
  padding: 0.1rem 0.38rem;
  font-size: 0.74rem;
  background: color-mix(in srgb, var(--ink) 12%, transparent);
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.6rem;
}

li {
  list-style: none;
}

.state {
  margin: 0;
}

.error {
  color: #900f2f;
}
</style>
