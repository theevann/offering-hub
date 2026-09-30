const CHANNELS = new Set(['url', 'email', 'phone', 'whatsapp', 'telegram']);
const PURPOSES = new Set(['booking', 'inquiry', 'information', 'social', 'community', 'location', 'payment']);

function normalizeResources(resources) {
    const unique = new Map();
    for (const resource of Array.isArray(resources) ? resources : []) {
        if (!CHANNELS.has(resource?.channel) || typeof resource.value !== 'string') continue;
        let { channel } = resource;
        let value = resource.value.trim();
        if (!value) continue;

        if (channel === 'email') {
            value = value.replace(/\s*(?:\[at\]|\s+at\s+)\s*/gi, '@')
                .replace(/\s*(?:\[dot\]|\s+dot\s+)\s*/gi, '.');
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) continue;
        }
        if (channel === 'telegram' && /^@[a-z\d_]+$/i.test(value)) {
            value = `https://t.me/${value.slice(1)}`;
        }
        if (['url', 'whatsapp', 'telegram'].includes(channel) && /^https?:\/\//i.test(value)) {
            let url;
            try { url = new URL(value); } catch { continue; }
            if (url.username || url.password) continue;
            const host = url.hostname.toLowerCase();
            if (['wa.me', 'api.whatsapp.com', 'chat.whatsapp.com'].includes(host)) {
                channel = 'whatsapp';
                const number = host === 'wa.me' ? url.pathname.slice(1)
                    : host === 'api.whatsapp.com' && url.pathname === '/send' ? url.searchParams.get('phone') : null;
                if (number && /^\+?\d{7,15}$/.test(number)) value = `+${number.replace(/^\+/, '')}`;
                else if (host === 'chat.whatsapp.com') value = url.href;
                else continue;
            } else if (['t.me', 'telegram.me'].includes(host)) {
                channel = 'telegram';
                url.hostname = 't.me';
                value = url.href;
            } else if (channel === 'url') value = url.href;
            else continue;
        } else if (channel === 'url' || channel === 'telegram') continue;

        if (['phone', 'whatsapp'].includes(channel) && !value.startsWith('https://') && !value.startsWith('http://')) {
            if (!/^\+?[\d ()-]+$/.test(value)) continue;
            value = value.replace(/[ ()-]/g, '');
            if (!/^\+?\d{7,15}$/.test(value)) continue;
        }
        const purposes = (Array.isArray(resource.purposes) ? resource.purposes : []).filter(purpose => PURPOSES.has(purpose));
        const key = `${channel}:${channel === 'email' ? value.toLowerCase() : value}`;
        const previous = unique.get(key);
        unique.set(key, { value: previous?.value || value, channel, purposes: [...new Set([...(previous?.purposes || []), ...purposes])] });
    }
    return [...unique.values()];
}

module.exports = { normalizeResources };
