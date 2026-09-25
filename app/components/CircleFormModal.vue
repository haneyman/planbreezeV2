<template>
  <UModal v-model:open="open" title="New circle" description="Each person gets an email invite. They can join without connecting a calendar." :ui="{ content: 'max-w-xl' }">
    <template #body>
      <form id="circle-form" class="flex flex-col gap-4" @submit.prevent="create">
        <div class="grid sm:grid-cols-2 gap-3">
          <UFormField label="Circle name" required>
            <UInput v-model="name" placeholder="e.g. Book club" class="w-full" autofocus />
          </UFormField>
          <UFormField label="Linked calendar" hint="Optional">
            <USelect v-model="calendar" :items="calendarItems" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Color">
          <div role="radiogroup" aria-label="Color" class="flex gap-2">
            <button
              v-for="c in CIRCLE_COLORS"
              :key="c"
              type="button"
              role="radio"
              :aria-checked="color === c"
              :aria-label="c"
              class="size-8 rounded-[9px] cursor-pointer"
              :class="color === c ? 'ring-2 ring-offset-2 ring-[#1D2733]' : ''"
              :style="{ background: c }"
              @click="color = c"
            />
          </div>
        </UFormField>
        <div class="flex flex-col gap-2">
          <div class="text-sm font-medium">People</div>
          <div v-for="(p, i) in people" :key="i" class="grid grid-cols-[1.2fr_1fr_auto] gap-2">
            <UInput v-model="p.email" type="email" placeholder="Email address" :aria-label="`Email for person ${i + 1}`" />
            <UInput v-model="p.label" placeholder="Label, e.g. Aunt Lisa" :aria-label="`Label for person ${i + 1}`" />
            <UButton color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="`Remove person ${i + 1}`" @click="people.splice(i, 1)" />
          </div>
          <UButton color="neutral" variant="outline" size="sm" icon="i-lucide-plus" class="self-start" @click="people.push({ email: '', label: '' })">
            Add another person
          </UButton>
        </div>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" @click="open = false">Cancel</UButton>
        <UButton type="submit" form="circle-form" :loading="saving">Create circle &amp; send invites</UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { api } from "~~/convex/_generated/api";
import { CIRCLE_COLORS } from "~/utils/colors";

const open = defineModel<boolean>("open", { default: false });
const props = defineProps<{ calendars: { label: string; value: string }[] }>();
const emit = defineEmits<{ created: [id: string] }>();

const run = useRun();
const name = ref("");
const calendar = ref("none");
const color = ref(CIRCLE_COLORS[0]!);
const people = ref([{ email: "", label: "" }, { email: "", label: "" }]);
const saving = ref(false);
const calendarItems = computed(() => [{ label: "None — use my default calendar", value: "none" }, ...props.calendars]);

watch(open, (o) => {
  if (!o) return;
  name.value = "";
  calendar.value = "none";
  color.value = CIRCLE_COLORS[Math.floor(Math.random() * CIRCLE_COLORS.length)]!;
  people.value = [{ email: "", label: "" }, { email: "", label: "" }];
});

async function create() {
  if (!name.value.trim()) return;
  saving.value = true;
  const id = await run(
    () =>
      mutate(api.circles.create, {
        name: name.value,
        color: color.value,
        linkedCalendarId: calendar.value === "none" ? undefined : calendar.value,
        members: people.value.filter((p) => p.email.trim() || p.label.trim()).map((p) => ({ email: p.email || undefined, label: p.label })),
      }),
    "Circle created",
  );
  saving.value = false;
  if (id) {
    emit("created", id);
    open.value = false;
  }
}
</script>
