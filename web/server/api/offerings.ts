export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  try {
    const response = await $fetch(
      `${config.apiInternalBase}/offerings/all`
    )

    return response
  } catch (error: any) {
    console.error('API error:', error?.message)

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch offerings from API'
    })
  }
})