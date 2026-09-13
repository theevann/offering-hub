<script setup>
    const route = useRoute()
</script>

<template>
    <main class="about-page">
        <h1>About</h1>
        <p>This is the about page for the application.</p>
        <p>Current route: {{ route.path }}</p>
    </main>
</template>

<style scoped>
    .about-page {
        padding: 2rem;
    }
</style>