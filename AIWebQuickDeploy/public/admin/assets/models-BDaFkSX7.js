
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.hurui.me
 */
  
import{i as e}from"./auth-DsJT25oW.js";var t={queryModels:t=>e.get(`models/query`,{params:t}),setModels:t=>e.post(`models/setModel`,t),delModels:t=>e.post(`models/delModel`,t),queryTokenCatalog:t=>e.get(`models/queryTokenCatalog`,{params:t}),setTokenCatalog:t=>e.post(`models/setTokenCatalog`,t),delTokenCatalog:t=>e.post(`models/delTokenCatalog`,t),syncTokenCatalog:t=>e.post(`models/syncTokenCatalog`,t),syncTokenCatalogProgress:t=>e.get(`models/syncTokenCatalogProgress`,{params:t}),lookupTokenCatalog:t=>e.get(`models/lookupTokenCatalog`,{params:t})};export{t};