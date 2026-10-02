
// Combine multiple raw message texts into a formatted string for LLM parsing.
function formatBatchText(rawMessages, withTimestamps = false) {
    if (!Array.isArray(rawMessages) || rawMessages.length === 0) return '';
    if (rawMessages.length === 1) return rawMessages[0].rawText || '';

    return rawMessages
        .map((m, idx) => {
            const timeStr = m.timestamp && withTimestamps
                ? ` [${new Date(m.timestamp).toISOString()}]`
                : m.createdAt && withTimestamps
                    ? ` [${new Date(m.createdAt).toISOString()}]`
                    : '';
            const text = m.rawText || '';
            return `--- Message ${idx + 1}${timeStr} ---\n${text}`.trim();
        })
        .filter(Boolean)
        .join('\n\n');
}

function collectBatchMedia(rawMessages) {
    if (!Array.isArray(rawMessages)) return [];
    return rawMessages.flatMap((m) => m.media || []);
}

function isTrivialBatch(combinedText, allMedia, minChars = 20) {
    const hasMedia = Array.isArray(allMedia) && allMedia.length > 0;
    if (hasMedia) return false;
    const trimmed = (combinedText || '').trim();
    return trimmed.length < minChars;
}

// Calculates the next execution time for a debounced processing job.
function calculateNextScheduledAt({
    now = new Date(),
    createdAt,
    maxWaitSeconds = 300,
    debounceSeconds = 60,
    isFull = false,
}) {
    const nowDate = now instanceof Date ? now : new Date(now);
    if (isFull) {
        return nowDate;
    }
    const targetMs = nowDate.getTime() + (debounceSeconds * 1000);
    const maxReadyMs = createdAt.getTime() + (maxWaitSeconds * 1000);
    return new Date(Math.min(targetMs, maxReadyMs));
}

module.exports = {
    calculateNextScheduledAt,
    formatBatchText,
    collectBatchMedia,
    isTrivialBatch,
};

