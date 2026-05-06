import api from '../index';

export default {
  queryModels: (params: any) => api.get('models/query', { params }),
  setModels: (data: any) => api.post('models/setModel', data),
  delModels: (data: any) => api.post('models/delModel', data),
  queryTokenCatalog: (params: any) => api.get('models/queryTokenCatalog', { params }),
  setTokenCatalog: (data: any) => api.post('models/setTokenCatalog', data),
  delTokenCatalog: (data: any) => api.post('models/delTokenCatalog', data),
  syncTokenCatalog: (data: any) => api.post('models/syncTokenCatalog', data),
  syncTokenCatalogProgress: (params: { syncId: string }) =>
    api.get('models/syncTokenCatalogProgress', { params }),
  lookupTokenCatalog: (params: { modelId: string }) =>
    api.get('models/lookupTokenCatalog', { params }),
};
