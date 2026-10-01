// Pure functions: no fetching or Vue state, so date rules can be tested directly.
export const marketplaceCategories = ['SERVICE', 'RENTAL', 'SALE']

export function dateKey(value, timeZone) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date)
    const part = (type) => parts.find((item) => item.type === type).value
    return `${part('year')}-${part('month')}-${part('day')}`
}

export function isValidDateKey(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const date = new Date(`${value}T12:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function addDays(value, count) {
    const date = new Date(`${value}T12:00:00Z`)
    date.setUTCDate(date.getUTCDate() + count)
    return date.toISOString().slice(0, 10)
}

export function formatDay(value, options = { weekday: 'long', month: 'short', day: 'numeric' }) {
    return new Intl.DateTimeFormat('en', { ...options, timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))
}

export function matchesDate(offering, selectedDate, view, timeZone) {
    if (!offering.startTime) return view === 'list' // Undated events have their own section.
    const startDay = dateKey(offering.startTime, timeZone)
    if (!startDay) return false
    // End times are exclusive: an event ending at midnight is not on the next day.
    const endTime = new Date(offering.endTime).getTime()
    const lastDay = offering.endTime && endTime > new Date(offering.startTime).getTime()
        ? dateKey(endTime - 1, timeZone) : startDay
    return view === 'map'
        ? startDay <= selectedDate && lastDay >= selectedDate
        : lastDay >= selectedDate
}

export function filterOfferings(offerings, { mode, view, selectedDate, search, topic, category, timeZone }) {
    const words = `${search}`.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
    return offerings.filter((offering) => {
        const isMarketplace = marketplaceCategories.includes(offering.category)
        if (mode === 'events' && isMarketplace) return false
        if (mode === 'services' && offering.category !== 'SERVICE') return false
        if (mode === 'marketplace' && !['RENTAL', 'SALE'].includes(offering.category)) return false
        if (category && offering.category !== category) return false
        if (topic && (!offering.topics || !offering.topics.includes(topic))) return false

        const text = [offering.title, offering.description, offering.locationText,
            offering.venue?.displayName, offering.category, ...(Array.isArray(offering.topics) ? offering.topics : [])].join(' ').toLocaleLowerCase()
        if (!words.every((word) => text.includes(word))) return false

        return isMarketplace || matchesDate(offering, selectedDate, view, timeZone)
    }).sort((a, b) => mode !== 'events'
        ? Number(a.distanceKm) - Number(b.distanceKm)
        : (a.startTime ? new Date(a.startTime).getTime() : Infinity) - (b.startTime ? new Date(b.startTime).getTime() : Infinity))
}

export function groupAgenda(offerings, selectedDate, timeZone) {
    const groups = new Map()
    for (const offering of offerings) {
        // Events already in progress appear under the selected start day.
        const day = offering.startTime ? dateKey(offering.startTime, timeZone) : ''
        const key = day ? (day < selectedDate ? selectedDate : day) : 'undated'
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(offering)
    }
    return [...groups].map(([date, items]) => ({ date, offerings: items }))
}

export function offeringCoordinates(offering) {
    // Online coordinates scope discovery to a community; they are not a map pin.
    if (offering.locationMode === 'online') return null
    const lat = offering.latitude ?? offering.location?.coordinates?.[1]
    const lng = offering.longitude ?? offering.location?.coordinates?.[0]
    if (lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null
    if (Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180) return null
    return [Number(lat), Number(lng)]
}

// Highlight days with matches, including days spanned by retreats.
export function countOfferingsByDay(offerings, days, timeZone) {
    const intervals = offerings.filter((offering) => offering.startTime).map((offering) => {
        const start = dateKey(offering.startTime, timeZone)
        const end = offering.endTime && new Date(offering.endTime) > new Date(offering.startTime)
            ? dateKey(new Date(offering.endTime).getTime() - 1, timeZone) : start
        return { start, end }
    })
    return Object.fromEntries(days.map((day) => [day,
        intervals.filter(({ start, end }) => start <= day && day <= end).length,
    ]))
}
