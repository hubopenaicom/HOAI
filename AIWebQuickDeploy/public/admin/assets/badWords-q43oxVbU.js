
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.hurui.me
 */
  
import{i as e}from"./auth-DsJT25oW.js";var t={queryBadWords:(t={})=>e.get(`badwords/query`,{params:t}),queryViolation:(t={})=>e.get(`badwords/violation`,{params:t}),delBadWords:t=>e.post(`badwords/del`,t),addBadWords:t=>e.post(`badwords/add`,t),updateBadWords:t=>e.post(`badwords/update`,t)};export{t};