<template>
  <div class="px-4 md:px-9 py-7 grid lg:grid-cols-[1fr_360px] gap-8 max-w-6xl">
    <div class="flex flex-col gap-5 min-w-0">
      <div>
        <h1 class="font-display text-[34px] font-semibold">Add from anywhere</h1>
        <p class="text-muted mt-1">Paste a link, an email or a sentence. Breeze pulls out the date, place and tickets.</p>
      </div>

      <form class="flex flex-col gap-2" @submit.prevent="extract">
        <label for="paste" class="text-sm font-bold">Paste a link or text</label>
        <UTextarea id="paste" v-model="input" :rows="3" autoresize placeholder="https://… or “dinner at the Parks' on the 14th”" class="w-full" />
        <div class="flex gap-2">
          <UButton type="submit" :loading="extracting" icon="i-lucide-sparkles">Find the event</UButton>
          <UButton color="neutral" variant="ghost" @click="startBlank">Fill it in myself</UButton>
        </div>
        <p v-if="message" class="text-sm text-coral-700">{{ message }}</p>
      </form>

      <UCard v-if="draft">
        <template #header>
          <div class="flex items-center gap-2 text-[13px] font-bold text-muted">
            <UIcon name="i-lucide-sparkles" class="size-4 text-coral-500" />{{ captureId ? "From your email" : "Check the details" }}
          </div>
        </template>
        <form id="capture-form" @submit.prevent="save">
          <PlanFields v-model="draft" :circles="circles ?? []" />
        </form>
        <template #footer>
          <div class="flex gap-2 justify-end">
            <UButton color="neutral" variant="outline" @click="reset">Cancel</UButton>
            <UButton type="submit" form="capture-form" :loading="saving">{{ draft.status === "committed" ? "Commit & add to calendar" : "Save to radar" }}</UButton>
          </div>
        </template>
      </UCard>

      <section v-if="inbox?.length" class="flex flex-col gap-3">
        <h2 class="text-lg font-bold">From your inbox</h2>
        <div v-for="c in inbox" :key="c._id" class="flex items-center gap-3 rounded-xl border border-line bg-white p-3.5">
          <UIcon name="i-lucide-mail" class="size-5 text-sea-700 shrink-0" />
          <div class="grow min-w-0">
            <div class="text-sm font-semibold truncate">{{ c.draft?.title ?? c.subject ?? "Forwarded email" }}</div>
            <div class="text-xs text-muted">
              {{ c.status === "processing" ? "Reading…" : c.status === "failed" ? c.error : c.draft ? formatWhen(c.draft) : "" }}
            </div>
          </div>
          <UButton v-if="c.status === 'draft' && c.draft" size="sm" @click="review(c._id, c.draft)">Review</UButton>
          <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-x" aria-label="Dismiss" @click="mutate(api.capture.dismiss, { captureId: c._id })" />
        </div>
      </section>
    </div>

    <aside class="flex flex-col gap-3">
      <h2 class="text-sm font-bold">Other ways to add</h2>
      <div class="rounded-2xl bg-white border border-line p-4 flex gap-3">
        <UIcon name="i-lucide-mail" class="size-5 text-sea-700 shrink-0 mt-0.5" />
        <div class="min-w-0">
          <div class="text-sm font-bold">Forward an email</div>
          <div class="text-[13px] text-muted">Forward from {{ viewer?.email ?? "your sign-in address" }} to</div>
          <div class="text-[13px] font-semibold break-all">{{ viewer?.inboundAddress ?? "…" }}</div>
        </div>
      </div>
      <div class="rounded-2xl bg-white border border-line p-4 flex gap-3">
        <UIcon name="i-lucide-app-window" class="size-5 text-sea-700 shrink-0 mt-0.5" />
        <div>
          <div class="text-sm font-bold">Browser extension</div>
          <div class="text-[13px] text-muted">One click on any event page opens it here. Load the <code>extension/</code> folder in Chrome (chrome://extensions → Load unpacked).</div>
        </div>
      </div>
      <div class="rounded-2xl bg-white border border-line p-4 flex gap-3">
        <UIcon name="i-lucide-smartphone" class="size-5 text-sea-700 shrink-0 mt-0.5" />
        <div>
          <div class="text-sm font-bold">From your phone</div>
          <div class="text-[13px] text-muted">Share a link to this page, or open planbreeze.com/capture?url=… from any app.</div>
        </div>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import type { EventCandidate, PlanDraft } from "~/utils/types";
import { draftFromEvent, draftToArgs, emptyDraft } from "~/utils/draft";
import { formatWhen, todayLocal } from "~/utils/dates";

const route = useRoute();
const run = useRun();
const { data: viewer } = useQuery(api.users.viewer);
const { data: circles } = useQuery(api.circles.list);
const { data: inbox } = useQuery(api.capture.inbox);

const input = ref("");
const message = ref("");
const extracting = ref(false);
const saving = ref(false);
const draft = ref<PlanDraft | null>(null);
const captureId = ref<Id<"captures"> | null>(null);

async function extract() {
  if (!input.value.trim()) return;
  extracting.value = true;
  message.value = "";
  const res = await run(() => runAction(api.capture.extract, { input: input.value }));
  extracting.value = false;
  if (!res) return;
  captureId.value = null;
  if (res.draft) draft.value = draftFromEvent(res.draft);
  else {
    message.value = res.message ?? "";
    startBlank();
    if (/^https?:\/\//.test(input.value.trim())) draft.value!.url = input.value.trim();
  }
}

function startBlank() {
  captureId.value = null;
  draft.value = emptyDraft(todayLocal());
}

function review(id: Id<"captures">, e: EventCandidate) {
  captureId.value = id;
  draft.value = draftFromEvent(e);
}

function reset() {
  draft.value = null;
  captureId.value = null;
  input.value = "";
  message.value = "";
}

async function save() {
  if (!draft.value?.title.trim()) return;
  saving.value = true;
  const d = draft.value;
  const { note, ...rest } = draftToArgs(d);
  const ok = await run(
    () =>
      mutate(api.capture.save, {
        event: { ...rest, reason: note },
        circleId: d.circleId === "me" ? undefined : (d.circleId as Id<"circles">),
        status: d.status,
        captureId: captureId.value ?? undefined,
      }),
    d.status === "committed" ? "Committed" : "Saved to your radar",
  );
  saving.value = false;
  if (ok) reset();
}

// The browser extension and share links open /capture?url=...
onMounted(() => {
  const url = route.query.url ?? route.query.text;
  if (typeof url === "string" && url) {
    input.value = url;
    extract();
  }
});
</script>
