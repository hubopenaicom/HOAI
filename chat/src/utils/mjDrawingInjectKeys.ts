import type { InjectionKey, Ref } from 'vue'

/** 绘画页 provide：与 index.vue 中 mjRefCrefUrl 等为同一 Ref，供高级参数子组件在上传后直接同步，避免 emit 链丢失导致 --cref 未进 prompt */
export const mjDrawingRefCrefKey: InjectionKey<Ref<string>> = Symbol.for('hoai.mjDrawingRefCref')
export const mjDrawingRefSrefKey: InjectionKey<Ref<string>> = Symbol.for('hoai.mjDrawingRefSref')
export const mjDrawingRefOrefKey: InjectionKey<Ref<string>> = Symbol.for('hoai.mjDrawingRefOref')
