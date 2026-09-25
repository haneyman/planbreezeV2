<template>
  <UDropdownMenu v-if="choices.length > 1" :items="[choices]">
    <UButton :size="size" color="secondary" variant="soft" class="radar-bar" trailing-icon="i-lucide-chevron-down" :loading="busy">Add to radar</UButton>
  </UDropdownMenu>
  <UButton v-else :size="size" color="secondary" variant="soft" class="radar-bar" :loading="busy" @click="$emit('add', undefined)">Add to radar</UButton>
</template>

<script setup lang="ts">
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";

withDefaults(defineProps<{ busy?: boolean; size?: "sm" | "md" }>(), { busy: false, size: "sm" });
const emit = defineEmits<{ add: [circleId: Id<"circles"> | undefined] }>();
const { data: circles } = useQuery(api.circles.list);
const choices = computed(() => [
  { label: "Just me", icon: "i-lucide-user", onSelect: () => emit("add", undefined) },
  ...(circles.value ?? [])
    .filter((c) => c.myAccess !== "viewer")
    .map((c) => ({ label: c.name, icon: "i-lucide-users", onSelect: () => emit("add", c._id) })),
]);
</script>
