<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-2">
      <UIcon name="i-lucide-sparkles" class="size-5 text-coral-500" />
      <h2 class="font-display text-[21px] font-semibold">Ask Breeze</h2>
    </div>
    <form class="flex flex-col gap-2" @submit.prevent="ask()">
      <label for="ask-input" class="text-[13px] text-muted">Ask about events, open dates or ideas</label>
      <div class="flex gap-2">
        <UInput id="ask-input" v-model="text" placeholder="Find a wine tasting in October" size="lg" class="grow" />
        <UButton type="submit" icon="i-lucide-arrow-right" size="lg" aria-label="Ask Breeze" />
      </div>
    </form>
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="p in prompts"
        :key="p"
        type="button"
        class="text-xs font-semibold text-sea-900 bg-sea-100 hover:bg-sea-200 px-2.5 py-1.5 rounded-full cursor-pointer"
        @click="ask(p)"
      >
        {{ p }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const text = ref("");
const prompts = ["Free Saturdays next month", "Kid-friendly this weekend", "Wine tastings nearby"];
function ask(q = text.value) {
  if (q.trim()) navigateTo({ path: "/ask", query: { q } });
}
</script>
