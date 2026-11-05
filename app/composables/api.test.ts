import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { computed, effectScope, nextTick, onScopeDispose, reactive, ref, shallowRef, toValue, watch } from "vue";

vi.mock("~/utils/api", () => ({ api: { users: { viewer: vi.fn() } }, request: vi.fn() }));
beforeEach(() => {
  vi.useFakeTimers();
  for (const [name, value] of Object.entries({ computed, onScopeDispose, reactive, ref, shallowRef, toValue, watch })) vi.stubGlobal(name, value);
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const settle = async () => { await Promise.resolve(); await nextTick(); await Promise.resolve(); };

test("calendar read actions do not refresh subscribed queries; writes still do", async () => {
  const { useQuery, runAction, mutate } = await import("./api");
  const scope = effectScope();
  const viewer = vi.fn().mockResolvedValue({ _id: "user" });
  scope.run(() => useQuery(viewer));
  try {
    await settle(); expect(viewer).toHaveBeenCalledTimes(1);
    await runAction(vi.fn().mockResolvedValue({ events: [] }), {});
    await settle(); expect(viewer).toHaveBeenCalledTimes(1);
    await mutate(vi.fn().mockResolvedValue(null), {});
    await settle(); expect(viewer).toHaveBeenCalledTimes(2);
  } finally { scope.stop(); }
});

test("polling retains displayed data while a refresh is pending and stops on unmount", async () => {
  const { useQuery } = await import("./api");
  const scope = effectScope();
  let complete!: (value: { title: string }[]) => void;
  const read = vi.fn().mockResolvedValueOnce([{ title: "Existing event" }]).mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  const query = scope.run(() => useQuery(read))!;
  await settle();
  await vi.advanceTimersByTimeAsync(5000);
  expect(read).toHaveBeenCalledTimes(2);
  expect(query.data.value).toEqual([{ title: "Existing event" }]);
  complete([{ title: "Updated event" }]); await settle();
  expect(query.data.value).toEqual([{ title: "Updated event" }]);
  scope.stop();
  await vi.advanceTimersByTimeAsync(10000);
  expect(read).toHaveBeenCalledTimes(2);
});
