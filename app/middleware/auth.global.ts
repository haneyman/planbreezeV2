export default defineNuxtRouteMiddleware(async (to) => {
  await authReady();
  if (!authState.authenticated && to.path !== "/login") return navigateTo({ path: "/login", query: to.fullPath !== "/" ? { next: to.fullPath } : {} });
  if (authState.authenticated && to.path === "/login") return navigateTo((to.query.next as string) || "/");
});
