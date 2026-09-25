// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2026-09-01",
  // PlanBreeze is a client-rendered app: Convex handles data and realtime.
  ssr: false,
  modules: ["@nuxt/ui"],
  css: ["~/assets/css/main.css"],
  ui: { colorMode: false },
  // Bundle every icon the app uses so nothing is fetched from the Iconify API at runtime.
  icon: { clientBundle: { scan: true, sizeLimitKb: 512 } },
  runtimeConfig: {
    public: {
      // Set NUXT_PUBLIC_CONVEX_URL (printed by `npx convex dev`, e.g. https://happy-otter-123.convex.cloud)
      convexUrl: "",
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
