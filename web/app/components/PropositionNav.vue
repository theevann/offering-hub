<template>
  <nav class="prop-nav">
    <UButton
      v-for="item in pages"
      :key="item.to"
      :to="item.to"
      color="neutral"
      :variant="route.path === item.to ? 'solid' : 'soft'"
      class="nav-pill"
    >
      <div class="content">
        <span class="title">{{ item.label }}</span>
        <small v-if="item.copy">{{ item.copy }}</small>
      </div>
    </UButton>
  </nav>
</template>

<script setup>
const route = useRoute()

const pages = [
  { label: 'Home', to: '/', copy: 'Overview' },
  { label: 'Proposition 1', to: '/proposition-1', copy: 'Mosaic' },
  { label: 'Proposition 2', to: '/proposition-2', copy: 'Desk' },
  { label: 'Proposition 3', to: '/proposition-3', copy: 'Timeline' },
  { label: 'Proposition 4', to: '/proposition-4', copy: 'City' },
  { label: 'Proposition 5', to: '/proposition-5', copy: 'Boards' },
]
</script>

<style scoped>
.prop-nav {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.nav-pill {
  justify-content: flex-start;
}

.content {
  display: grid;
  gap: 0.1rem;
  text-align: left;
}

.title {
  font-size: 0.84rem;
  font-weight: 700;
}

small {
  font-size: 0.68rem;
  opacity: 0.75;
}

@media (max-width: 1020px) {
  .prop-nav {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 580px) {
  .prop-nav {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
