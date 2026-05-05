<script setup lang="ts">
  import type { HTMLAttributes } from 'vue';

  defineOptions({
    name: 'PageMain',
  });

  const props = withDefaults(
    defineProps<{
      title?: string;
      collaspe?: boolean;
      height?: string;
      class?: HTMLAttributes['class'];
      titleClass?: HTMLAttributes['class'];
      mainClass?: HTMLAttributes['class'];
    }>(),
    {
      title: '',
      collaspe: false,
      height: '',
    },
  );

  const slots = useSlots();
</script>

<template>
  <FaPageMain
    :title="!slots.title ? props.title : undefined"
    :collaspe="props.collaspe"
    :height="props.height"
    :class="props.class"
    :title-class="props.titleClass"
    :main-class="props.mainClass"
  >
    <template v-if="slots.title" #title>
      <slot name="title" />
    </template>
    <slot />
  </FaPageMain>
</template>
