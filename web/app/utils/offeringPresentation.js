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
    return end ? `${start} – ${end}` : start
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
    const modes = Array.isArray(offering?.locationModes)
        ? offering.locationModes
        : ['unknown']

    const place = offering?.venue?.displayName
        ?.split(' – ')[0]
        .split(' - ')[0]
        .split(' | ')[0]
        .trim()

    const options = []

    if (modes.includes('at_provider')) {
        options.push(place || "the host's location")
    }
    if (modes.includes('at_customer')) {
        options.push('your place')
    }
    if (modes.includes('online')) {
        options.push('online')
    }

    if (options.length === 0) return 'Location to be confirmed'
    if (options.length === 1) {
        return options[0] === 'online' ? 'Online' : `At ${options[0]}`
    }
    if (options.length === 2) {
        return `At ${options[0]} or ${options[1]}`
    }

    return `At ${options[0]}, ${options[1]}, or ${options[2]}`
}

export function offeringLocationNote(offering) {
    const modes = Array.isArray(offering?.locationModes)
        ? offering.locationModes
        : ['unknown']

    const isOnlineOnly = modes.length === 1 && modes[0] === 'online'
    if (isOnlineOnly) {
        return offering?.group?.name
            ? `Shared in ${offering.group.name}`
            : ''
    }

    const approximateArea = offering?.locationSource === 'GOOGLE_AREA'
        ? 'Approximate area.'
        : offering?.locationSource === 'GROUP_FALLBACK'
            ? 'Approximate area based on this community.'
            : ''

    // If an identifiable venue is already present, no secondary location note is needed
    if (offering?.venue) {
        return approximateArea
    }

    const locationText = offering?.locationText?.trim()
    if (locationText) {
        return locationText
    }
    return approximateArea
}

export function offeringDirectionsUrl(offering) {
    if (!offering) return ''
    const modes = offering?.locationModes || ['unknown']
    if (!modes.includes('at_provider')) return ''
    const resource = offering.resources?.find(item => item.channel === 'url' && item.purposes?.includes('location') && !item.purposes.includes('payment') && webUrl(item.value))
    const supplied = webUrl(offering.venue?.mapsUrl) || webUrl(resource?.value)
    if (supplied) return supplied
    if (['GROUP_FALLBACK', 'GOOGLE_AREA'].includes(offering.locationSource)) return ''
    const lat = offering.latitude ?? offering.venue?.latitude
    const lng = offering.longitude ?? offering.venue?.longitude
    if (lat == null || lng == null) return ''
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`
}