<template>
  <main class="p2">
    <section class="wrap top">
      <div>
        <p class="kicker">Proposition 2</p>
        <h1>Atlas Desk</h1>
        <p>Analyst-friendly layout with a sticky filter stack and compact offering table.</p>
      </div>
      <PropositionNav />
    </section>

    <section class="wrap desk">
      <aside>
        <ExplorerFilters
          theme-class="panel"
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
      </aside>

      <section class="table-wrap">
        <p v-if="loading" class="state">Loading offerings...</p>
        <p v-else-if="error" class="state error">{{ error }}</p>
        <p v-else-if="!filteredOfferings.length" class="state">No offering matches the current filters.</p>

        <table v-else>
          <thead>
            <tr>
              <th>Offering</th>
              <th>Category</th>
              <th>When</th>
              <th>Place</th>
              <th>Pricing</th>
              <th>Group</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="offering in filteredOfferings" :key="offering.id">
              <td>
                <strong>{{ offering.title || 'Untitled offering' }}</strong>
                <p>{{ offering.description || 'No description yet.' }}</p>
              </td>
              <td><span class="pill">{{ offering.category }}</span></td>
              <td>{{ formatDateRange(offering.startTime, offering.endTime) }}</td>
              <td>{{ offering.locationLabel }}</td>
              <td>{{ offering.priceLabel }}</td>
              <td>{{ offering.group?.name || 'Unknown group' }}</td>
            </tr>
          </tbody>
        </table>
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
  toggleCategory,
  togglePricingType,
  clearFilters,
} = useOfferingExplorer()

const { formatDateRange } = useOfferingFormatters()
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@400;500;700&family=DM+Serif+Text:ital@0;1&display=swap');

.p2 {
  --ink: #132341;
  min-height: 100vh;
  background:
    linear-gradient(180deg, #f4f8fd 0%, #f6efe5 100%);
  color: var(--ink);
  font-family: 'IBM Plex Sans Condensed', sans-serif;
}

.wrap {
  max-width: 1220px;
  margin: 0 auto;
  padding: 1.2rem 1rem;
}

.top {
  display: grid;
  gap: 0.75rem;
}

.kicker {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 0.7rem;
  font-weight: 700;
}

h1 {
  margin: 0;
  font-family: 'DM Serif Text', serif;
  font-size: clamp(1.9rem, 4vw, 3rem);
}

.top p {
  margin: 0.35rem 0 0;
  max-width: 740px;
}

.desk {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(300px, 360px) 1fr;
  align-items: start;
}

aside {
  position: sticky;
  top: 0.8rem;
}

.panel {
  background: color-mix(in srgb, white 86%, #dae7f7 14%);
}

.table-wrap {
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--ink) 14%, transparent);
  overflow: hidden;
  background: color-mix(in srgb, white 84%, transparent);
}

.state {
  margin: 0;
  padding: 1rem;
}

.error {
  color: #a30f25;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  text-align: left;
  vertical-align: top;
  padding: 0.75rem;
  border-bottom: 1px solid color-mix(in srgb, var(--ink) 12%, transparent);
  font-size: 0.9rem;
}

th {
  background: color-mix(in srgb, #d7e7fb 60%, white 40%);
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

td p {
  margin: 0.3rem 0 0;
  opacity: 0.8;
  max-width: 340px;
}

.pill {
  font-size: 0.74rem;
  border-radius: 999px;
  padding: 0.2rem 0.52rem;
  background: #dce6f4;
  font-weight: 700;
}

@media (max-width: 980px) {
  .desk {
    grid-template-columns: 1fr;
  }

  aside {
    position: static;
  }

  .table-wrap {
    overflow: auto;
  }

  table {
    min-width: 880px;
  }
}
</style>
