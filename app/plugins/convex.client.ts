export default defineNuxtPlugin(async () => {
  const url = useRuntimeConfig().public.convexUrl as string;
  if (!url) throw new Error("NUXT_PUBLIC_CONVEX_URL is not set. Run `npx convex dev` and copy the URL into .env.");
  await initConvex(url);
});
