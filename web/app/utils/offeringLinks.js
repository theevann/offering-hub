// Parsed messages are untrusted: only make ordinary web URLs clickable.
export function webUrl(value) {
    if (typeof value !== 'string') return ''
    try {
        const url = new URL(value)
        return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
    } catch {
        return ''
    }
}

export function offeringPhotoUrl(value) {
    console.log('offeringPhotoUrl', { value })
    if (typeof value !== 'string') return ''
    const savedPhoto = value.match(/^media\/([a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp|gif|avif))$/i)
    console.log('offeringPhotoUrl', { value, savedPhoto })
    return savedPhoto ? `/api/media/${encodeURIComponent(savedPhoto[1])}` : webUrl(value)
}

export function offeringResources(resources) {
    if (!Array.isArray(resources)) return []
    return resources.filter(resource => typeof resource?.value === 'string').map(resource => {
        const value = resource.value.trim()
        const channel = resource.channel
        const purposes = Array.isArray(resource.purposes) ? resource.purposes : []
        let href = ''
        if (channel === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            href = `mailto:${encodeURIComponent(value)}`
        } else if (channel === 'phone' && /^\+?\d{7,15}$/.test(value)) {
            href = `tel:${value}`
        } else if (channel === 'whatsapp' && /^\+\d{7,15}$/.test(value)) {
            href = `https://wa.me/${value.slice(1)}`
        } else if (['url', 'whatsapp', 'telegram'].includes(channel)) {
            const url = webUrl(value)
            const host = url ? new URL(url).hostname : ''
            if (channel === 'url' || (channel === 'whatsapp' && host === 'chat.whatsapp.com')
                || (channel === 'telegram' && host === 't.me')) href = url
        }
        const booking = purposes.includes('booking')
        const payment = purposes.includes('payment')
        const labels = { email: 'Send an email', phone: 'Call', whatsapp: 'Contact on WhatsApp', telegram: 'Contact on Telegram', url: 'Open link' }
        const bookingLabels = { email: 'Book by email', phone: 'Call to book', whatsapp: 'Book via WhatsApp', telegram: 'Book via Telegram', url: 'Book / sign up' }
        let label = booking ? bookingLabels[channel] : labels[channel]
        if (payment) label = 'Payment details'
        else if (!booking && channel === 'url') {
            if (purposes.includes('location')) label = 'Get directions'
            else if (purposes.includes('social')) label = 'Social page'
            else if (purposes.includes('community')) label = 'Join community'
            else if (purposes.includes('information')) label = 'More information'
            else if (purposes.includes('inquiry')) label = 'Ask a question'
        } else if (!booking && purposes.includes('community')) {
            label = channel === 'whatsapp' ? 'Join WhatsApp group' : 'Join Telegram community'
        }
        return { value, channel, purposes, href, label: label || value }
    })
}
