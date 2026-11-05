// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2026-09-01",
  // The client-rendered frontend calls the NestJS REST API.
  ssr: false,
  serverDir: "nuxt-server",
  modules: ["@nuxt/ui"],
  css: ["~/assets/css/main.css"],
  ui: { colorMode: false },
  // Bundle every icon the app uses so nothing is fetched from the Iconify API at runtime.
  icon: { clientBundle: { scan: true, sizeLimitKb: 512 } },
  runtimeConfig: {
    public: {
      apiUrl: "http://localhost:3001/api",
    },
  },
  app: {
    head: {
      title: "PlanBreeze",
      htmlAttrs: { lang: "en" },
      meta: [{ name: "description", content: "Plan together. Keep the rest on your radar." }],
      link: [{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
    },
  },
  devtools: { enabled: false },
});
