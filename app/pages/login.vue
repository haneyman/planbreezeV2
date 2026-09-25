<template>
  <div class="min-h-dvh grid place-items-center px-4">
    <div class="w-full max-w-sm flex flex-col gap-8">
      <div class="flex flex-col items-center gap-3 text-center">
        <BrandMark :size="44" />
        <h1 class="font-display text-4xl font-semibold">PlanBreeze</h1>
        <p class="text-muted">Plan together. Keep the rest on your radar.</p>
      </div>
      <UCard>
        <div class="flex flex-col gap-3">
          <UButton size="xl" color="neutral" variant="outline" block icon="i-simple-icons-google" :loading="busy === 'google'" @click="go('google')">
            Continue with Google
          </UButton>
          <UButton size="xl" color="neutral" block icon="i-simple-icons-apple" :loading="busy === 'apple'" @click="go('apple')">
            Continue with Apple
          </UButton>
          <p class="text-xs text-muted text-center mt-1">
            Signing in doesn't give PlanBreeze access to your calendar. You can connect it later in Settings.
          </p>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: "blank" });

const route = useRoute();
const run = useRun();
const busy = ref<"google" | "apple" | null>(null);

async function go(provider: "google" | "apple") {
  busy.value = provider;
  await run(() => signIn(provider, (route.query.next as string) || "/"));
  busy.value = null;
}
</script>
