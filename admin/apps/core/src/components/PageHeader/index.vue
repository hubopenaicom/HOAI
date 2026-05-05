<script setup lang="ts">
  import type { HTMLAttributes } from 'vue';

  defineOptions({
    name: 'PageHeader',
  });

  const props = defineProps<{
    title?: string;
    /** 页头说明（与 description 二选一） */
    content?: string;
    /** 与 content 相同含义，兼容部分页面的命名习惯 */
    description?: string;
    /**
     * 左侧图标（Iconify 名，如 i-mdi:cog）。不传则从当前路由 matched 中继承最后一个带 meta.icon 的路由。
     * 传 `null` 可强制不显示图标。
     */
    icon?: string | null;
    class?: HTMLAttributes['class'];
    mainClass?: HTMLAttributes['class'];
    defaultClass?: HTMLAttributes['class'];
  }>();

  const slots = useSlots();
  const route = useRoute();

  const descriptionText = computed(() => props.content ?? props.description);

  const resolvedIcon = computed(() => {
    if (props.icon === null) {
      return undefined;
    }
    if (props.icon) {
      return props.icon;
    }
    const m = route.matched.findLast(r => Boolean(r.meta?.icon));
    return (m?.meta?.icon as string | undefined) ?? undefined;
  });
</script>

<template>
  <FaPageHeader
    :title="undefined"
    :description="!slots.content ? descriptionText : undefined"
    :class="props.class"
    :main-class="props.mainClass"
    :default-class="props.defaultClass"
  >
    <template #title>
      <div v-if="resolvedIcon" class="flex items-center gap-3">
        <FaIcon :name="resolvedIcon" class="size-7 shrink-0 text-primary" />
        <div class="min-w-0 flex-1">
          <slot name="title">{{ title }}</slot>
        </div>
      </div>
      <slot v-else name="title">{{ title }}</slot>
    </template>
    <template v-if="slots.content" #description>
      <slot name="content" />
    </template>
    <slot />
  </FaPageHeader>
</template>
