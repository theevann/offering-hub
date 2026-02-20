<template>
  <main class="home">
    <section class="hero">
      <p class="eyebrow">Offering Explorer</p>
      <h1>Five Front-End Propositions for your parsed offering database.</h1>
      <p>
        Each concept includes category tags, pricing filters, country/city filters,
        group-aware location context, date presets, search, and sorting.
      </p>
      <PropositionNav />
    </section>

    <section class="grid">
      <NuxtLink v-for="item in cards" :key="item.to" :to="item.to" class="card">
        <h2>{{ item.title }}</h2>
        <p>{{ item.copy }}</p>
        <span>Open proposition</span>
      </NuxtLink>
    </section>
  </main>
</template>

<script setup>
const cards = [
  {
    to: '/proposition-1',
    title: 'Proposition 1: Aurora Mosaic',
    copy: 'Bold gradient canvas with magazine-style cards and quick stats.',
  },
  {
    to: '/proposition-2',
    title: 'Proposition 2: Atlas Desk',
    copy: 'Data-heavy split layout with a sticky control panel and table focus.',
  },
  {
    to: '/proposition-3',
    title: 'Proposition 3: Ribbon Timeline',
    copy: 'Chronological journey optimized for upcoming events and time awareness.',
  },
  {
    to: '/proposition-4',
    title: 'Proposition 4: City Signals',
    copy: 'Location-first browsing with group context and city-led discovery.',
  },
  {
    to: '/proposition-5',
    title: 'Proposition 5: Category Boards',
    copy: 'Kanban-style category columns for quick comparison and triage.',
  },
]
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Fraunces:opsz,wght@9..144,600&display=swap');

.home {
  --bg-1: #fdf3dd;
  --bg-2: #dff5ec;
  --ink: #1a2242;
  min-height: 100vh;
  padding: 2.2rem 1rem 3.5rem;
  background:
    radial-gradient(circle at 20% 10%, #ffd67f 0%, transparent 35%),
    radial-gradient(circle at 80% 0%, #88d9f8 0%, transparent 42%),
    linear-gradient(130deg, var(--bg-1), var(--bg-2));
  color: var(--ink);
  font-family: 'Sora', sans-serif;
}

.hero {
  max-width: 980px;
  margin: 0 auto;
}

.eyebrow {
  margin: 0;
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  font-size: 0.72rem;
}

h1 {
  margin: 0.5rem 0 0.8rem;
  font-family: 'Fraunces', serif;
  font-size: clamp(2rem, 4vw, 3.2rem);
  line-height: 1.08;
  max-width: 840px;
}

.hero p {
  max-width: 760px;
  margin: 0 0 1rem;
}

.grid {
  max-width: 980px;
  margin: 1.2rem auto 0;
  display: grid;
  gap: 0.9rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.card {
  text-decoration: none;
  color: inherit;
  border-radius: 22px;
  padding: 1.2rem;
  border: 1px solid color-mix(in srgb, var(--ink) 18%, transparent);
  background: color-mix(in srgb, white 78%, transparent);
  display: grid;
  gap: 0.65rem;
}

.card h2 {
  margin: 0;
  font-size: 1.15rem;
}

.card p {
  margin: 0;
  opacity: 0.85;
}

.card span {
  font-size: 0.84rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

@media (max-width: 800px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
