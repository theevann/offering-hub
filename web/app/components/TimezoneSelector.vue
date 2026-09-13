<script setup>
const props = defineProps({
    modelValue: { type: String, default: 'location' },
    locationTimezone: { type: String, default: '' },
    userTimezone: { type: String, required: true },
    loading: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const selector = ref(null)
const trigger = ref(null)
const isOpen = ref(false)
const label = computed(() => {
    if (props.modelValue === 'user') return props.userTimezone
    if (props.loading) return 'Finding timezone…'
    return props.locationTimezone || 'Location timezone unavailable'
})
function closeOutside(event) {
    if (!selector.value?.contains(event.target)) isOpen.value = false
}
function selectTimezone(value) {
    emit('update:modelValue', value)
    isOpen.value = false
    trigger.value?.focus()
}
function closeWithKeyboard() {
    isOpen.value = false
    trigger.value?.focus()
}
onMounted(() => document.addEventListener('pointerdown', closeOutside, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeOutside, true))
</script>

<template>
    <span ref="selector" class="timezone-selector" @keydown.esc.stop.prevent="closeWithKeyboard">
        <button ref="trigger" type="button" class="timezone-trigger" :aria-expanded="isOpen"
            aria-controls="timezone-options" aria-label="Choose display timezone" @click="isOpen = !isOpen">({{ label }})</button>
        <span v-if="isOpen" id="timezone-options" class="timezone-options" role="group" aria-label="Display timezone">
            <button type="button" :aria-pressed="modelValue === 'user'" @click="selectTimezone('user')">
                <strong>Your timezone</strong><small>{{ userTimezone }}</small>
            </button>
            <button type="button" :aria-pressed="modelValue === 'location'" :disabled="!locationTimezone"
                @click="selectTimezone('location')">
                <strong>Location timezone <small>(default)</small></strong>
                <small>{{ locationTimezone || (loading ? 'Loading…' : 'Unavailable') }}</small>
            </button>
        </span>
    </span>
</template>

<style scoped>
.timezone-selector { position: relative; display: inline-block; font-weight: 400; }
button { font: inherit; cursor: pointer; }
.timezone-trigger { padding: 0.25rem 0; border: 0; background: transparent; color: #59677e; font-size: 0.8125rem; text-align: left; }
.timezone-trigger:hover { color: #244bd6; text-decoration: underline; }
.timezone-options { position: absolute; z-index: 20; top: 100%; left: 0; width: 15rem; padding: 0.4rem; background: white; border: 1px solid #dce4f1; border-radius: 0.6rem; box-shadow: 0 8px 24px #182e5520; }
.timezone-options button { display: grid; gap: 0.25rem; width: 100%; padding: 0.75rem; text-align: left; background: white; color: #182e55; border: 0; border-radius: 0.35rem; font-size: 0.875rem; }
.timezone-options button:hover, .timezone-options button[aria-pressed="true"] { background: #edf2ff; }
.timezone-options button[aria-pressed="true"] { box-shadow: inset 3px 0 #244bd6; }
.timezone-options small { font-size: 0.8125rem; font-weight: 400; color: #59677e; }
button:focus-visible { outline: 3px solid #6684ef; outline-offset: 2px; }
button:disabled { opacity: 0.6; cursor: default; }
</style>
