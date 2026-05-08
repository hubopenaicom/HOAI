<script setup lang="ts">
  import { Icon } from '@iconify/vue';

  defineOptions({
    name: 'SvgIcon',
  });

  const props = defineProps<{
    name: string;
    flip?: 'horizontal' | 'vertical' | 'both';
    rotate?: number;
    color?: string;
    size?: string | number;
  }>();

  const outputType = computed(() => {
    if (/^https?:\/\//.test(props.name)) {
      return 'img';
    }
    // 与 FaIcon 一致：`i-集合:图标` 若走 Uno presetIcons，易被漏扫导致生产环境无 CSS、图标空白；统一走 Iconify 运行时。
    if (/^i-[^:]+:.+/.test(props.name) || props.name.includes(':')) {
      return 'iconify';
    }
    return 'svg';
  });

  /** 如 i-mdi:home → mdi:home */
  const iconifyIconId = computed(() => {
    const n = props.name;
    if (!n) {
      return '';
    }
    return /^i-[^:]+:.+/.test(n) ? n.slice(2) : n;
  });

  const style = computed(() => {
    const transform = [];
    if (props.flip) {
      switch (props.flip) {
        case 'horizontal':
          transform.push('rotateY(180deg)');
          break;
        case 'vertical':
          transform.push('rotateX(180deg)');
          break;
        case 'both':
          transform.push('rotateX(180deg)');
          transform.push('rotateY(180deg)');
          break;
      }
    }
    if (props.rotate) {
      transform.push(`rotate(${props.rotate % 360}deg)`);
    }
    return {
      ...(props.color && { color: props.color }),
      ...(props.size && {
        fontSize: typeof props.size === 'number' ? `${props.size}px` : props.size,
      }),
      ...(transform.length && { transform: transform.join(' ') }),
    };
  });
</script>

<template>
  <i
    class="relative inline-flex h-[1em] w-[1em] items-center justify-center fill-current leading-[1em]"
    :style="style"
  >
    <Icon
      v-if="outputType === 'iconify'"
      :icon="iconifyIconId"
      class="block h-[1em] w-[1em] shrink-0"
    />
    <svg v-else-if="outputType === 'svg'" class="h-[1em] w-[1em]" aria-hidden="true">
      <use :xlink:href="`#icon-${name}`" />
    </svg>
    <img v-else-if="outputType === 'img'" :src="name" class="h-[1em] w-[1em]" />
  </i>
</template>
