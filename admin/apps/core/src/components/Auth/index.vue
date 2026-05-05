<script setup lang="ts">
  import useAuth from '@/composables/useAuth'

  defineOptions({
    name: 'Auth',
  });

  const props = defineProps<{
    value: string | string[];
  }>();

  function check() {
    return useAuth().auth(props.value);
  }
</script>

<template>
  <div>
    <slot v-if="check()" />
    <slot v-else name="no-auth" />
  </div>
</template>
