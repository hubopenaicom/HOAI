import api from '../index'

const apiDashboard = {
  getBaseInfo: () => api.get('/statistic/base'),
  getChatStatistic: (params: { days: number }): Promise<any> => {
    return api.get('/statistic/chatStatistic', {
      params: { days: params.days },
    })
  },
  getBaiduVisit: (params: any): Promise<any> => {
    return api.get('/statistic/baiduVisit', {
      params: { days: params.days },
    })
  },
  getObserverCharts: (params: any) => api.get('/statistic/observerCharts', { params }),
};

export default apiDashboard;
