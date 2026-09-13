// Page for displaying a single offering based on its ID.
// The offering ID is extracted from the route parameters and can be used to fetch the offering details from the backend or a store.

<script setup>
const route = useRoute();
const offeringId = route.params.id;
</script>

<template>
    <main class="offering-page">
        <h1>Offering Details</h1>
        <p>Displaying details for offering with ID: {{ offeringId }}</p>
        <!-- Additional details about the offering can be displayed here -->
    </main>
</template>

<style scoped>
    .offering-page {
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
    }
</style>