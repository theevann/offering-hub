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

export function offeringContacts(contacts) {
    if (!Array.isArray(contacts)) return []
    return contacts.filter(contact => typeof contact?.value === 'string').map(contact => {
        const value = contact.value.trim()
        let href = ''
        let label = value
        if (contact.type === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            href = `mailto:${encodeURIComponent(value)}`
            label = 'Send an email'
        } else if (['phone', 'whatsapp'].includes(contact.type) && /^\+?[\d ()-]+$/.test(value)) {
            const phone = value.replace(/[^\d+]/g, '')
            if (/^\+?\d{7,15}$/.test(phone)) {
                href = contact.type === 'whatsapp' ? `https://wa.me/${phone.replace('+', '')}` : `tel:${phone}`
                label = contact.type === 'whatsapp' ? 'Contact on WhatsApp' : 'Call'
            }
        } else {
            href = webUrl(value)
            if (href) label = contact.type === 'telegram' ? 'Contact on Telegram' : 'Contact'
        }
        return { value, href, label }
    })
}
