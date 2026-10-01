import { dateKey, formatDay } from './exploreOfferings.js'
import { webUrl } from './offeringLinks.js'

// Agenda cards and map previews use the same labels and timezone rules.
export function offeringTimeLabel(offering, timeZone, selectedDate = '') {
    if (!offering.startTime) return 'Date TBC'
    if (selectedDate && dateKey(offering.startTime, timeZone) < selectedDate) return 'Continues'
    if (offering.startTimePrecision === 'wholeDay') return 'All day'
    if (offering.startTimePrecision === 'unknown') return 'Time TBC'
    const start = new Intl.DateTimeFormat('en-GB', {
        timeZone, hour: '2-digit', minute: '2-digit',
    }).format(new Date(offering.startTime))
    const end = offering.endTime && new Intl.DateTimeFormat('en-GB', {
        timeZone, hour: '2-digit', minute: '2-digit',
    }).format(new Date(offering.endTime))
    return end ? `${start} – ${end}` : start;
}

export function offeringDateRange(offering, timeZone) {
    if (!offering.startTime || !offering.endTime) return ''
    const startDay = dateKey(offering.startTime, timeZone)
    const endDay = dateKey(new Date(offering.endTime).getTime() - 1, timeZone)
    return endDay > startDay ? `${formatDay(startDay)} – ${formatDay(endDay)}` : ''
}

export function offeringPriceLabel({ pricingType, price }, { showUnknown = true } = {}) {
    if (pricingType === 'free') return 'Free'
    if (pricingType === 'donation') return 'Donation'
    if (typeof price === 'string' && price.trim()) return price
    if (price?.amount != null) return `${price.amount} ${price.currency || ''}`.trim()
    if (price?.minAmount != null && price?.maxAmount != null) {
        return `${price.minAmount}–${price.maxAmount} ${price.currency || ''}`.trim()
    }
    return showUnknown ? 'Price not specified' : ''
}

export function offeringVenueLabel(offering) {
    if (offering.locationMode === 'online') return 'Online'
    if (offering.locationMode === 'at_customer') return 'At your location'
    let place = offering.venue?.displayName || offering.locationText;
    place = place?.split(" – ")[0].split(" | ")[0].trim() || ''
    if (offering.locationMode === 'hybrid') return place ? `${place} · Online option` : 'Online and in person'
    return place || 'Location to be confirmed'
}

export function offeringLocationNote(offering) {
    if (offering.locationMode === 'online') {
        return offering.group?.name ? `Shared in ${offering.group.name}` : ''
    }
    if (offering.locationMode === 'at_customer') {
        return offering.locationText || 'Confirm the area.'
    }
    if (offering.locationSource === 'GOOGLE_AREA') return 'Approximate area. Confirm the exact location.'
    if (offering.locationSource === 'GROUP_FALLBACK') return 'Approximate area derived from the community. Confirm the exact location.'
    return ''
}

export function offeringDirectionsUrl(offering) {
    if (!offering || ['online', 'at_customer'].includes(offering.locationMode)) return ''
    const resource = offering.resources?.find(item => item.channel === 'url' && item.purposes?.includes('location') && !item.purposes.includes('payment') && webUrl(item.value))
    const supplied = webUrl(offering.venue?.mapsUrl) || webUrl(resource?.value)
    if (supplied) return supplied
    if (['GROUP_FALLBACK', 'GOOGLE_AREA'].includes(offering.locationSource)) return ''
    const lat = offering.latitude ?? offering.venue?.latitude
    const lng = offering.longitude ?? offering.venue?.longitude
    if (lat == null || lng == null) return ''
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`
}
