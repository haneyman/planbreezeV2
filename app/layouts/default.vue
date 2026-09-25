<template>
  <div class="min-h-dvh md:flex">
    <!-- Sidebar (desktop) -->
    <aside class="hidden md:flex w-60 shrink-0 flex-col gap-7 border-r border-line bg-paper-raised px-4 py-6 sticky top-0 h-dvh">
      <NuxtLink to="/" class="flex items-center gap-2.5 px-2">
        <BrandMark :size="30" />
        <span class="font-display text-[22px] font-semibold">PlanBreeze</span>
      </NuxtLink>
      <nav aria-label="Main" class="flex flex-col gap-0.5">
        <NuxtLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 h-11 px-3 rounded-[10px] text-sm font-medium text-[#3A4552] hover:bg-sea-50"
          active-class="!bg-sea-100 !text-sea-900 font-semibold"
        >
          <UIcon :name="item.icon" class="size-[18px]" />
          <span class="grow">{{ item.label }}</span>
          <span v-if="item.badge" class="text-[11px] font-bold bg-coral-100 text-coral-800 px-2 py-0.5 rounded-full">{{ item.badge }}</span>
        </NuxtLink>
      </nav>
      <div class="grow" />
      <div class="rounded-xl border border-line bg-white p-3.5 text-[13px] flex flex-col gap-2">
        <div class="font-semibold">Calendars</div>
        <div v-if="viewer?.google" class="flex items-center gap-2">
          <span class="size-2 rounded-full" :class="viewer.google.status === 'ok' ? 'bg-[#3F7A5A]' : 'bg-coral-500'" />
          <span class="grow">Google Calendar</span>
          <span class="text-xs text-muted">{{ viewer.google.status === 'ok' ? 'Connected' : 'Reconnect' }}</span>
        </div>
        <NuxtLink v-else to="/settings" class="text-sea-700 font-semibold">Connect Google Calendar</NuxtLink>
      </div>
      <UDropdownMenu :items="userMenu" :content="{ side: 'top', align: 'start' }">
        <UButton color="neutral" variant="ghost" class="justify-start">
          <UAvatar :src="viewer?.image" :alt="viewer?.name" size="xs" />
          <span class="truncate">{{ viewer?.name }}</span>
        </UButton>
      </UDropdownMenu>
    </aside>

    <!-- Top bar (mobile) -->
    <header class="md:hidden sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-paper-raised px-4 h-14">
      <NuxtLink to="/" class="flex items-center gap-2 grow">
        <BrandMark :size="24" />
        <span class="font-display text-lg font-semibold">PlanBreeze</span>
      </NuxtLink>
      <USlideover v-model:open="menuOpen" side="left" title="PlanBreeze">
        <UButton icon="i-lucide-menu" color="neutral" variant="ghost" aria-label="Open menu" />
        <template #body>
          <nav aria-label="Main" class="flex flex-col gap-1">
            <UButton v-for="item in nav" :key="item.to" :to="item.to" :icon="item.icon" :label="item.label" color="neutral" variant="ghost" size="lg" class="justify-start" @click="menuOpen = false" />
            <UButton icon="i-lucide-log-out" label="Sign out" color="neutral" variant="ghost" size="lg" class="justify-start" @click="signOut" />
          </nav>
        </template>
      </USlideover>
    </header>

    <main class="grow min-w-0">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { api } from "~~/convex/_generated/api";

const { data: viewer } = useQuery(api.users.viewer);
const { data: suggestions } = useQuery(api.breeze.suggestions);
const menuOpen = ref(false);

const nav = computed(() => [
  { to: "/", label: "Planner", icon: "i-lucide-calendar-range" },
  { to: "/discover", label: "Discover", icon: "i-lucide-radar", badge: suggestions.value?.length ? `${suggestions.value.length} new` : "" },
  { to: "/ask", label: "Ask Breeze", icon: "i-lucide-sparkles" },
  { to: "/capture", label: "Add from anywhere", icon: "i-lucide-plus" },
  { to: "/settings", label: "Calendars & circles", icon: "i-lucide-users" },
]);

const userMenu = [[{ label: "Settings", icon: "i-lucide-settings", to: "/settings" }, { label: "Sign out", icon: "i-lucide-log-out", onSelect: () => signOut() }]];

// First visit: remember the browser's time zone so dates and Breeze searches line up.
watch(viewer, (v) => {
  if (v && !v.timeZone) mutate(api.users.updateProfile, { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
});
</script>
