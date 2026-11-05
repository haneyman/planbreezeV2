import { api, request } from "~/utils/api";
export const authState = reactive({ loading: true, authenticated: false });
let ready: Promise<void> | undefined;
export function initApi() {
  ready ??= api.users
    .viewer()
    .then((viewer) => {
      authState.authenticated = !!viewer;
    })
    .finally(() => {
      authState.loading = false;
    });
  return ready;
}
export const authReady = () => ready ?? initApi();
export async function signIn(provider: "google" | "apple", next = "/") {
  const base = useRuntimeConfig().public.apiUrl as string;
  window.location.href = `${base}/auth/${provider}?next=${encodeURIComponent(next)}`;
}
export async function signOut() {
  await request("/auth/logout", "POST", {});
  authState.authenticated = false;
  window.location.href = "/login";
}
const invalidation = ref(0);
type Read<A, T> = (args: A) => Promise<T>;
export function useQuery<A extends object, T>(
  query: Read<A, T>,
  args: MaybeRefOrGetter<A | "skip"> = {} as A,
) {
  const data = shallowRef<T>();
  const error = shallowRef<Error>();
  let version = 0;
  let disposed = false;
  async function refresh() {
    const a = toValue(args);
    const current = ++version;
    if (a === "skip") {
      data.value = undefined;
      return;
    }
    try {
      const value = await query(a);
      if (!disposed && current === version) {
        data.value = value;
        error.value = undefined;
      }
    } catch (e) {
      if (!disposed && current === version) {
        error.value =
          e instanceof Error ? e : new Error("Could not load data.");
        if ((e as { statusCode?: number }).statusCode === 401) {
          authState.authenticated = false;
          void navigateTo("/login");
        }
      }
    }
  }
  watch(
    () => JSON.stringify(toValue(args)),
    () => {
      data.value = undefined;
      void refresh();
    },
    { immediate: true },
  );
  watch(invalidation, () => void refresh());
  const timer = setInterval(() => {
    if (document.visibilityState === "visible") void refresh();
  }, 5000);
  const visible = () => {
    if (document.visibilityState === "visible") void refresh();
  };
  document.addEventListener("visibilitychange", visible);
  onScopeDispose(() => {
    disposed = true;
    version++;
    clearInterval(timer);
    document.removeEventListener("visibilitychange", visible);
  });
  return {
    data,
    error,
    isLoading: computed(() => data.value === undefined && !error.value),
    refresh,
  };
}
export async function mutate<A, T>(
  operation: (args: A) => Promise<T>,
  args: A,
) {
  const value = await operation(args);
  invalidation.value++;
  return value;
}
// Reads and extraction must not invalidate queries: calendar reads otherwise
// refresh the viewer, whose watcher starts another calendar read.
export async function runAction<A, T>(operation: (args: A) => Promise<T>, args: A) {
  return operation(args);
}
export function errorMessage(e: unknown) {
  const message = (e as { data?: { message?: string | string[] } })?.data
    ?.message;
  return Array.isArray(message)
    ? message.join(". ")
    : message || (e instanceof Error ? e.message : "Something went wrong.");
}
export function useRun() {
  const toast = useToast();
  return async <T>(
    fn: () => Promise<T>,
    success?: string,
  ): Promise<T | undefined> => {
    try {
      const value = await fn();
      if (success)
        toast.add({ title: success, color: "success", icon: "i-lucide-check" });
      return value;
    } catch (e) {
      toast.add({
        title: errorMessage(e),
        color: "error",
        icon: "i-lucide-circle-alert",
      });
      return undefined;
    }
  };
}
