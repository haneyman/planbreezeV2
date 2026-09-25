<template>
  <UModal v-model:open="open" :title="plan ? 'Edit plan' : 'New plan'" :ui="{ content: 'max-w-xl' }">
    <template #body>
      <form id="plan-form" @submit.prevent="save">
        <PlanFields v-model="draft" :circles="circles" />
      </form>
    </template>
    <template #footer>
      <div class="flex w-full gap-2">
        <UButton v-if="plan?.canEdit" color="error" variant="ghost" icon="i-lucide-trash-2" @click="remove">Delete</UButton>
        <div class="grow" />
        <UButton color="neutral" variant="outline" @click="open = false">Cancel</UButton>
        <UButton type="submit" form="plan-form" :loading="saving">{{ plan ? "Save" : "Add plan" }}</UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import type { Circle, Plan, PlanDraft } from "~/utils/types";
import { draftFromPlan, draftToArgs, emptyDraft } from "~/utils/draft";
import { todayLocal } from "~/utils/dates";

const open = defineModel<boolean>("open", { default: false });
const props = defineProps<{ plan?: Plan | null; initial?: PlanDraft | null; circles: Circle[] }>();
const emit = defineEmits<{ saved: [id: string] }>();

const run = useRun();
const saving = ref(false);
const draft = ref<PlanDraft>(emptyDraft(todayLocal()));

watch(open, (isOpen) => {
  if (isOpen) draft.value = props.plan ? draftFromPlan(props.plan) : props.initial ? { ...props.initial } : emptyDraft(todayLocal());
});

async function save() {
  if (!draft.value.title.trim()) return;
  saving.value = true;
  const args = draftToArgs(draft.value);
  const circleId = draft.value.circleId === "me" ? undefined : (draft.value.circleId as Id<"circles">);
  const id = await run(async () => {
    if (!props.plan) return mutate(api.plans.create, { ...args, circleId, status: draft.value.status });
    const p = props.plan;
    await mutate(api.plans.update, {
      planId: p._id,
      ...args,
      startTime: args.startTime ?? null,
      endTime: args.endTime ?? null,
      circleId: (circleId ?? null) !== (p.circleId ?? null) ? (circleId ?? null) : undefined,
    });
    if (draft.value.status !== p.status)
      await mutate(draft.value.status === "committed" ? api.plans.commit : api.plans.uncommit, { planId: p._id });
    return p._id;
  }, props.plan ? "Plan saved" : "Plan added");
  saving.value = false;
  if (id) {
    emit("saved", id);
    open.value = false;
  }
}

async function remove() {
  if (!props.plan) return;
  const ok = await run(() => mutate(api.plans.remove, { planId: props.plan!._id }), "Plan deleted");
  if (ok !== undefined) open.value = false;
}
</script>
