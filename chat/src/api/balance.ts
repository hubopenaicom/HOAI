import { get, post } from '@/utils/request'

/* get rechargeLog */
export function fetchGetRechargeLogAPI<T>(data: { page?: number; size?: number }): Promise<T> {
  return get<T>({
    url: '/balance/rechargeLog',
    data,
  })
}

export function fetchGetConsumptionLogAPI<T>(data: { page?: number; size?: number }): Promise<T> {
  return get<T>({
    url: '/balance/consumptionLog',
    data,
  })
}

/** 当前用户各模型 Token 消耗汇总（需登录） */
export function fetchGetModelTokenUsageAPI<T>(): Promise<T> {
  return get<T>({
    url: '/balance/modelTokenUsage',
  })
}

/* query balance */
export function fetchGetBalanceQueryAPI<T>(): Promise<T> {
  return get<T>({
    url: '/balance/query',
  })
}

export function fetchVisitorCountAPI<T>(): Promise<T> {
  return get<T>({
    url: '/balance/getVisitorCount',
  })
}

export function fetchSyncVisitorDataAPI<T>(): Promise<T> {
  return post<T>({
    url: '/balance/inheritVisitorData',
  })
}
