// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  // Production checks must not overwrite a running dev server's generated files.
  $production: { buildDir: '.nuxt-build' },
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    apiInternalBase: process.env.NUXT_API_INTERNAL_BASE,
    // public: {
    //   apiBase: process.env.API_BASE_URL
    // }
  },
  vite: {
    server: {
      allowedHosts: ['kinetic-iron-navy.ngrok-free.dev'],
    },
  },
})