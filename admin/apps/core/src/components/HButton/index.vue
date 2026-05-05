<script setup lang="ts">
  import type { ButtonProps } from 'element-plus';
  import type { ClassValue } from 'clsx';
  import { computed, useAttrs } from 'vue';
  import { cn } from '@/utils';

  defineOptions({
    name: 'HButton',
    inheritAttrs: false,
  });

  const props = withDefaults(
    defineProps<{
      block?: boolean;
      outline?: boolean;
      text?: boolean;
      disabled?: boolean;
      loading?: boolean;
      type?: ButtonProps['type'];
    }>(),
    {
      block: false,
      outline: false,
      text: false,
      disabled: false,
      loading: false,
      type: 'default',
    },
  );

  const attrs = useAttrs();

  const variant = computed<
    'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  >(() => {
    if (props.text) {
      return 'ghost';
    }
    if (!props.outline) {
      if (props.type === 'danger') {
        return 'destructive';
      }
      if (props.type === 'primary') {
        return 'default';
      }
      return 'secondary';
    }
    return 'outline';
  });

  const toneClass = computed(() => {
    const c: string[] = [];
    if (props.block) {
      c.push('w-full');
    }
    if (props.outline) {
      if (props.type === 'success') {
        c.push(
          'border-emerald-600/70 text-emerald-700 hover:bg-emerald-600/10 dark:border-emerald-500/60 dark:text-emerald-400',
        );
      }
      if (props.type === 'danger') {
        c.push('border-destructive text-destructive hover:bg-destructive/10');
      }
      if (props.type === 'primary') {
        c.push('border-primary text-primary hover:bg-primary/10');
      }
    }
    else if (props.type === 'success') {
      c.push('bg-emerald-600 text-white hover:bg-emerald-600/90');
    }
    return c.join(' ');
  });

  const mergedClass = computed(() =>
    cn(toneClass.value, attrs.class as ClassValue | undefined),
  );

  const restAttrs = computed(() => {
    const { class: _c, ...rest } = attrs as Record<string, unknown>;
    return rest;
  });
</script>

<template>
  <FaButton
    :variant="variant"
    :disabled="disabled"
    :loading="loading"
    :class="mergedClass"
    v-bind="restAttrs"
  >
    <slot />
  </FaButton>
</template>
