<script setup>
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { offeringCoordinates } from '~/utils/exploreOfferings'
import { offeringTimeLabel, offeringDateRange, offeringPriceLabel, offeringVenueLabel, offeringLocationNote } from '~/utils/offeringPresentation'

const props = defineProps({
    offerings: { type: Array, required: true },
    center: { type: Object, required: true },
    timeZone: { type: String, required: true },
    showTime: { type: Boolean, default: true },
    selectedDate: { type: String, default: '' },
})
const emit = defineEmits(['search-area'])
const router = useRouter()
const mapElement = ref(null)
const mapMoved = ref(false)
const mapError = ref('')
// Keep the viewport when visiting details and returning, but not for a new location.
const savedView = useState('explore-map-view', () => null)
let map
let markers
let resizeObserver

function saveViewport() {
    const center = map.getCenter()
    savedView.value = {
        lat: center.lat, lng: center.lng, zoom: map.getZoom(),
        searchLat: props.center.lat, searchLng: props.center.lng,
    }
}

function createPreview(offering) {
    // Plain DOM text nodes keep parsed messages out of HTML strings.
    const preview = document.createElement('article')
    preview.className = 'map-offering-preview'
    const title = document.createElement('a')
    title.textContent = offering.title
    title.href = `/offering/${encodeURIComponent(offering.id)}`
    title.addEventListener('click', (event) => {
        // Preserve normal new-tab shortcuts; regular clicks use Nuxt navigation.
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        router.push(title.getAttribute('href'))
    })
    preview.append(title)
    if (props.showTime) {
        const time = document.createElement('p')
        time.className = 'preview-time'
        time.textContent = offeringTimeLabel(offering, props.timeZone, props.selectedDate)
        const range = offeringDateRange(offering, props.timeZone)
        if (range) time.textContent += ` · ${range}`
        preview.append(time)
    }
    const venue = document.createElement('p')
    venue.textContent = offeringVenueLabel(offering)
    if (offering.distanceKm != null) venue.textContent += ` · ${Number(offering.distanceKm).toFixed(1)} km`
    if (offeringLocationNote(offering)) venue.textContent += ` · ${offeringLocationNote(offering)}`
    const price = document.createElement('p')
    price.textContent = offeringPriceLabel(offering)
    preview.append(venue, price)
    return preview
}

function drawOfferings() {
    if (!markers) return
    markers.clearLayers()
    const byLocation = new Map()
    for (const offering of props.offerings) {
        const coordinates = offeringCoordinates(offering)
        if (!coordinates) continue
        const key = coordinates.join(',')
        if (!byLocation.has(key)) byLocation.set(key, { coordinates, offerings: [] })
        byLocation.get(key).offerings.push(offering)
    }
    for (const group of byLocation.values()) {
        const popup = document.createElement('div')
        for (const offering of group.offerings) popup.append(createPreview(offering))
        L.marker(group.coordinates, {
            title: `${group.offerings.length} offering(s) here`,
            icon: L.divIcon({
                className: 'offering-marker', html: String(group.offerings.length),
                iconSize: [32, 32], iconAnchor: [16, 16],
            }),
        }).bindPopup(popup, { maxHeight: 280, minWidth: 220 }).addTo(markers)
    }
}

function searchThisArea() {
    const center = map.getCenter()
    emit('search-area', { lat: center.lat, lng: center.lng })
    mapMoved.value = false
}

function destroyMap() {
    resizeObserver?.disconnect()
    resizeObserver = null
    map?.remove()
    map = null
    markers = null
}

// A client-only component can mount before its container ref is ready on navigation.
// Initialize from the actual element, and tear down when that element goes away.
watch(mapElement, (element) => {
    destroyMap()
    if (!element) return
    const previous = savedView.value
    const sameSearch = previous?.searchLat === props.center.lat && previous?.searchLng === props.center.lng
    const center = sameSearch ? [previous.lat, previous.lng] : [props.center.lat, props.center.lng]
    map = L.map(element).setView(center, sameSearch ? previous.zoom : 12)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).on('tileerror', () => { mapError.value = 'Some map tiles could not load. You can still use the list view.' }).addTo(map)
    markers = L.layerGroup().addTo(map)
    drawOfferings()
    map.on('moveend', saveViewport)
    map.on('dragend', () => { mapMoved.value = true })
    resizeObserver = new ResizeObserver(() => map?.invalidateSize())
    resizeObserver.observe(element)
}, { flush: 'post' })
watch([() => props.offerings, () => props.timeZone, () => props.showTime, () => props.selectedDate], drawOfferings)
watch([() => props.center.lat, () => props.center.lng], ([lat, lng]) => {
    if (map) map.setView([lat, lng], map.getZoom())
})
onBeforeUnmount(destroyMap)
</script>

<template>
    <div class="map-wrapper">
        <button v-if="mapMoved" class="search-area" type="button" @click="searchThisArea">Search this area</button>
        <div ref="mapElement" class="map" aria-label="Map of matching offerings" />
        <p v-if="mapError" role="status">{{ mapError }}</p>
    </div>
</template>

<style scoped>
.map-wrapper { position: relative; }
.map { height: 65vh; min-height: 24rem; border-radius: 1rem; z-index: 0; }
.search-area { position: absolute; top: 1rem; left: 50%; transform: translateX(-50%); z-index: 1; padding: 0.8rem 1rem; border: 1px solid #244bd6; border-radius: 2rem; background: white; color: #244bd6; cursor: pointer; font: inherit; box-shadow: 0 2px 10px #182e5520; }
:deep(.offering-marker) { display: grid; place-items: center; border: 2px solid white; border-radius: 50%; background: #244bd6; color: white; font-size: 14px; font-weight: 700; box-shadow: 0 2px 6px #0004; }
:deep(.map-offering-preview) { padding: 0.5rem 0; font: 14px/1.5 Arial, sans-serif; }
:deep(.map-offering-preview + .map-offering-preview) { border-top: 1px solid #dce4f1; }
:deep(.map-offering-preview a) { font-weight: 600; color: #244bd6; }
:deep(.map-offering-preview p) { margin: 0.3rem 0 0; color: #59677e; }
:deep(.map-offering-preview .preview-time) { color: #182e55; font-weight: 600; }
p { padding: 0.75rem; font-size: 0.875rem; }
</style>
