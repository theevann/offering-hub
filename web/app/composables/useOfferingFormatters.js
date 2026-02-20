export function useOfferingFormatters() {
  const formatDateTime = (value) => {
    if (!value) return 'Date TBD'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Date TBD'

    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)
  }

  const formatDateRange = (startValue, endValue) => {
    if (!startValue && !endValue) return 'Date TBD'
    if (!startValue) return `Ends ${formatDateTime(endValue)}`
    if (!endValue) return formatDateTime(startValue)

    const startDate = new Date(startValue)
    const endDate = new Date(endValue)

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return formatDateTime(startValue)
    }

    const isSameDay =
      startDate.getFullYear() === endDate.getFullYear() &&
      startDate.getMonth() === endDate.getMonth() &&
      startDate.getDate() === endDate.getDate()

    if (isSameDay) {
      const day = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(startDate)
      const startTime = new Intl.DateTimeFormat('en-US', { timeStyle: 'short' }).format(startDate)
      const endTime = new Intl.DateTimeFormat('en-US', { timeStyle: 'short' }).format(endDate)
      return `${day}, ${startTime}-${endTime}`
    }

    return `${formatDateTime(startValue)} - ${formatDateTime(endValue)}`
  }

  return { formatDateTime, formatDateRange }
}