import { ConvexClient, ConvexHttpClient } from "convex/browser";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { api } from "~~/convex/_generated/api";

// A small Vue layer over the Convex browser client plus Convex Auth
// (a trimmed port of @convex-dev/auth/react's client, which is React-only).

let client: ConvexClient | null = null;
let convexUrl = "";
let token: string | null = null;

export const authState = reactive({ loading: true, authenticated: false });

export function convex() {
  if (!client) throw new Error("Convex client not initialised");
  return client;
}

const KEYS = { jwt: "__convexAuthJWT", refresh: "__convexAuthRefreshToken", verifier: "__convexAuthOAuthVerifier" };
const storageKey = (k: string) => `${k}_${convexUrl.replace(/[^a-zA-Z0-9]/g, "")}`;
const storage = {
  get: (k: string) => localStorage.getItem(storageKey(k)),
  set: (k: string, v: string) => localStorage.setItem(storageKey(k), v),
  del: (k: string) => localStorage.removeItem(storageKey(k)),
};

type Tokens = { token: string; refreshToken: string } | null | undefined;

function setTokens(tokens: Tokens) {
  if (tokens) {
    token = tokens.token;
    storage.set(KEYS.jwt, tokens.token);
    storage.set(KEYS.refresh, tokens.refreshToken);
  } else {
    token = null;
    storage.del(KEYS.jwt);
    storage.del(KEYS.refresh);
  }
}

/** Sign-in calls that must not carry the (possibly expired) current token. */
function signInUnauthenticated(args: FunctionArgs<typeof api.auth.signIn>) {
  return new ConvexHttpClient(convexUrl).action(api.auth.signIn, args);
}

async function fetchToken({ forceRefreshToken }: { forceRefreshToken: boolean }) {
  if (!forceRefreshToken) return token;
  const refresh = async () => {
    const refreshToken = storage.get(KEYS.refresh);
    if (!refreshToken) return null;
    try {
      const res = await signInUnauthenticated({ refreshToken });
      setTokens(res.tokens);
    } catch {
      setTokens(null);
    }
    return token;
  };
  // Only one tab refreshes at a time.
  return navigator.locks ? navigator.locks.request(KEYS.refresh, refresh) : refresh();
}

export async function initConvex(url: string) {
  convexUrl = url;
  client = new ConvexClient(url);

  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  if (code) {
    // Returning from Google/Apple: exchange the one-time code for tokens.
    params.delete("code");
    history.replaceState({}, "", location.pathname + (params.size ? `?${params}` : "") + location.hash);
    const verifier = storage.get(KEYS.verifier) ?? undefined;
    storage.del(KEYS.verifier);
    try {
      const res = await signInUnauthenticated({ params: { code }, verifier });
      setTokens(res.tokens);
    } catch (e) {
      console.error("Sign-in failed", e);
      setTokens(null);
    }
  } else {
    token = storage.get(KEYS.jwt);
  }

  if (!token && !storage.get(KEYS.refresh)) {
    authState.authenticated = false;
    authState.loading = false;
  }
  client.setAuth(fetchToken, (isAuthenticated) => {
    authState.authenticated = isAuthenticated;
    authState.loading = false;
  });
}

export function authReady() {
  return new Promise<void>((resolve) => {
    if (!authState.loading) return resolve();
    const stop = watch(
      () => authState.loading,
      (loading) => {
        if (!loading) {
          stop();
          resolve();
        }
      },
    );
  });
}

export async function signIn(provider: "google" | "apple", redirectTo = "/") {
  const verifier = storage.get(KEYS.verifier) ?? undefined;
  storage.del(KEYS.verifier);
  const res = await convex().action(api.auth.signIn, { provider, params: { redirectTo }, verifier });
  if (res.redirect) {
    if (res.verifier) storage.set(KEYS.verifier, res.verifier);
    window.location.href = res.redirect;
  }
}

export async function signOut() {
  try {
    await convex().action(api.auth.signOut, {});
  } catch {
    // already signed out
  }
  setTokens(null);
  window.location.href = "/login";
}

// Data --------------------------------------------------------------------------------

/** Reactive, live-updating Convex query. Pass "skip" to pause. */
export function useQuery<Q extends FunctionReference<"query">>(
  query: Q,
  args: MaybeRefOrGetter<FunctionArgs<Q> | "skip"> = {} as FunctionArgs<Q>,
) {
  const data = shallowRef<FunctionReturnType<Q> | undefined>(undefined);
  const error = shallowRef<Error | undefined>(undefined);
  let unsubscribe: (() => void) | undefined;
  watch(
    () => {
      const a = toValue(args);
      return a === "skip" ? "skip" : JSON.stringify(a);
    },
    (key) => {
      unsubscribe?.();
      unsubscribe = undefined;
      if (key === "skip") {
        data.value = undefined;
        return;
      }
      unsubscribe = convex().onUpdate(
        query,
        JSON.parse(key),
        (value) => {
          data.value = value;
          error.value = undefined;
        },
        (e) => {
          error.value = e;
        },
      );
    },
    { immediate: true },
  );
  onScopeDispose(() => unsubscribe?.());
  const isLoading = computed(() => data.value === undefined && !error.value);
  return { data, error, isLoading };
}

export const mutate = <M extends FunctionReference<"mutation">>(m: M, args: FunctionArgs<M>) =>
  convex().mutation(m, args);

export const runAction = <A extends FunctionReference<"action">>(a: A, args: FunctionArgs<A>) =>
  convex().action(a, args);

/** Turn a Convex error into a message for a toast. */
export function errorMessage(e: unknown) {
  if (e instanceof ConvexError) return String(e.data);
  if (e instanceof Error) return e.message.replace(/^.*Uncaught (ConvexError: )?/, "").split("\n")[0]!;
  return "Something went wrong.";
}

/** Run a mutation/action with a toast on failure (and optionally on success). */
export function useRun() {
  const toast = useToast();
  return async <T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
    try {
      const out = await fn();
      if (success) toast.add({ title: success, color: "success", icon: "i-lucide-check" });
      return out;
    } catch (e) {
      toast.add({ title: errorMessage(e), color: "error", icon: "i-lucide-circle-alert" });
      return undefined;
    }
  };
}
