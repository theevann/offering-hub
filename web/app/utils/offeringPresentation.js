import { dateKey, formatDay } from './exploreOfferings.js'

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

export function offeringPriceLabel({ pricingType, price }) {
    if (pricingType === 'free') return 'Free'
    if (pricingType === 'donation') return 'Donation'
    if (typeof price === 'string' && price.trim()) return price
    if (price?.amount != null) return `${price.amount} ${price.currency || ''}`.trim()
    if (price?.minAmount != null && price?.maxAmount != null) {
        return `${price.minAmount}–${price.maxAmount} ${price.currency || ''}`.trim()
    }
    return 'Price not specified'
}

export function offeringVenueLabel(offering) {
    return offering.venue?.displayName || offering.locationText || 'Location to be confirmed'
}
