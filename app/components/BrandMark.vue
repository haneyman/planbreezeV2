<template>
  <svg :width="size" :height="size" viewBox="0 0 28 28" fill="none" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
    <path d="M4 10h13a3.5 3.5 0 1 0-3.5-3.5" stroke="#24506B" />
    <path d="M4 15h18a3.5 3.5 0 1 1-3.5 3.5" stroke="#24506B" />
    <path d="M4 20h8" stroke="#D9774A" />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 28 });
</script>
