import { get } from '@/utils/request'

/* query models list  */
export function fetchQueryModelsListAPI<T>() {
  return get<T>({
    url: '/models/list',
  })
}

/* query base model config  */
export function fetchModelBaseConfigAPI<T>() {
  return get<T>({
    url: '/models/baseConfig',
  })
}

/** 绘画独立页：后台已启用且 drawingType>0 的模型 */
export function fetchDrawingModelsListAPI<T>() {
  return get<T>({
    url: '/models/drawingList',
  })
}
