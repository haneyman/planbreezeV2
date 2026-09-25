<template>
  <div class="lg:flex min-h-dvh">
    <div class="grow min-w-0 flex flex-col h-dvh">
      <div class="px-4 md:px-10 pt-6 pb-2 flex items-center gap-3">
        <h1 class="font-display text-[30px] font-semibold grow">Ask Breeze</h1>
        <UButton color="neutral" variant="outline" icon="i-lucide-square-pen" @click="newChat">New chat</UButton>
      </div>

      <div ref="scroller" class="grow overflow-y-auto px-4 md:px-10 py-4 flex flex-col gap-5">
        <div v-if="!chatId" class="max-w-xl text-muted text-[15px] leading-relaxed">
          Ask for events ("find a wine tasting in October"), open dates ("which Saturdays in November is everyone free?")
          or ideas for a trip. Breeze searches the web, checks your plans and never books anything without you.
        </div>
        <template v-for="m in messages ?? []" :key="m._id">
          <div v-if="m.role === 'user'" class="self-end max-w-lg bg-sea-700 text-white px-4 py-3 rounded-[18px_18px_4px_18px] text-[15px]">
            {{ m.text }}
          </div>
          <div v-else class="flex gap-3 items-start max-w-3xl">
            <div class="size-8 shrink-0 rounded-full bg-coral-100 grid place-items-center">
              <UIcon name="i-lucide-sparkles" class="size-4 text-coral-500" />
            </div>
            <div class="grow min-w-0 flex flex-col gap-3">
              <p v-if="m.pending" class="text-[15px] text-muted pt-1 animate-pulse">Searching and checking your calendar…</p>
              <p v-else class="text-[15px] leading-relaxed whitespace-pre-line pt-1">{{ m.text }}</p>
              <EventCard v-for="(e, i) in m.events ?? []" :key="i" :event="e" :fit="e.fit">
                <span v-if="added.has(key(m._id, i))" class="flex items-center gap-1 text-xs font-bold text-[#2C6B49]">
                  <UIcon name="i-lucide-check" class="size-4" />On your radar
                </span>
                <AddToRadar v-else @add="(c) => addEvent(m._id, i, e, c)" />
              </EventCard>
              <div v-if="!m.pending && m.events?.length && lastQuestion(m._id)" class="rounded-xl border border-line bg-paper-raised p-3.5 flex flex-wrap items-center gap-3 text-sm">
                <UIcon name="i-lucide-radar" class="size-5 text-sea-700" />
                <span class="grow">Want me to keep watching for things like this?</span>
                <UButton size="sm" variant="soft" @click="watchFor(lastQuestion(m._id)!)">Yes, keep watching</UButton>
              </div>
            </div>
          </div>
        </template>
      </div>

      <form class="px-4 md:px-10 pb-6 pt-3 border-t border-line" @submit.prevent="send()">
        <div class="flex gap-2 items-end bg-white border border-[#D6D0C3] rounded-2xl p-1.5 pl-3">
          <label for="composer" class="sr-only">Message Breeze</label>
          <UTextarea
            id="composer"
            v-model="text"
            :rows="1"
            autoresize
            :maxrows="6"
            variant="none"
            placeholder="Ask Breeze to find, compare or plan something…"
            class="grow"
            @keydown.enter.exact.prevent="send()"
          />
          <UButton type="submit" icon="i-lucide-arrow-up" size="lg" aria-label="Send" :loading="sending" />
        </div>
        <p class="text-xs text-muted mt-2">Breeze can see your plans and connected calendars' busy times. It never books or buys without asking.</p>
      </form>
    </div>

    <aside class="lg:w-[340px] shrink-0 border-l border-line bg-white px-5 py-6 flex flex-col gap-3">
      <h2 class="text-[15px] font-bold">Recent chats</h2>
      <button
        v-for="c in chats ?? []"
        :key="c._id"
        type="button"
        class="text-left text-sm py-1.5 truncate cursor-pointer"
        :class="c._id === chatId ? 'font-semibold text-sea-900' : 'text-[#3A4552] hover:text-[#1D2733]'"
        @click="chatId = c._id"
      >
        {{ c.title }}
      </button>
      <p v-if="!chats?.length" class="text-sm text-muted">No chats yet.</p>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import type { EventCandidate } from "~/utils/types";

const route = useRoute();
const router = useRouter();
const run = useRun();
const toast = useToast();

const chatId = ref<Id<"chats"> | null>(null);
const text = ref("");
const sending = ref(false);
const added = ref(new Set<string>());
const scroller = ref<HTMLElement>();

const { data: chats } = useQuery(api.breeze.chats);
const { data: messages } = useQuery(api.breeze.messages, () => (chatId.value ? { chatId: chatId.value } : "skip"));

watch(messages, () => nextTick(() => scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: "smooth" })));

const key = (id: string, i: number) => `${id}:${i}`;

async function send(q = text.value) {
  if (!q.trim() || sending.value) return;
  sending.value = true;
  const id = await run(() => mutate(api.breeze.send, { chatId: chatId.value ?? undefined, text: q }));
  sending.value = false;
  if (id) {
    chatId.value = id;
    text.value = "";
  }
}

function newChat() {
  chatId.value = null;
  text.value = "";
}

/** The question that led to an assistant message. */
function lastQuestion(messageId: string) {
  const list = messages.value ?? [];
  const i = list.findIndex((m) => m._id === messageId);
  for (let j = i - 1; j >= 0; j--) if (list[j]!.role === "user") return list[j]!.text;
  return null;
}

async function addEvent(messageId: string, i: number, e: EventCandidate & { fit?: string }, circleId?: Id<"circles">) {
  const { fit: _fit, ...event } = e;
  const ok = await run(() => mutate(api.breeze.addEventToRadar, { event, circleId }), "Added to your radar");
  if (ok) added.value = new Set(added.value).add(key(messageId, i));
}

async function watchFor(q: string) {
  const ok = await run(() => mutate(api.breeze.addSearch, { query: q }));
  if (ok) toast.add({ title: "Breeze will keep watching", description: "New finds will show up in Discover.", color: "success" });
}

// /ask?q=... from the Planner starts a new chat with that question.
onMounted(() => {
  const q = route.query.q;
  if (typeof q === "string" && q.trim()) {
    router.replace({ query: {} });
    send(q);
  }
});
</script>
