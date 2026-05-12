
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.hurui.me
 */
  
import{t as e}from"./settings-DA_S6N2d.js";import{s as t}from"./auth-yad2lxBS.js";import{s as n}from"./vue-router-DFzuDPgw.js";function r(e){return{all:e=e||new Map,on:function(t,n){var r=e.get(t);r?r.push(n):e.set(t,[n])},off:function(t,n){var r=e.get(t);r&&(n?r.splice(r.indexOf(n)>>>0,1):e.set(t,[]))},emit:function(t,n){var r=e.get(t);r&&r.slice().map(function(e){e(n)}),(r=e.get(`*`))&&r.slice().map(function(e){e(t,n)})}}}var i=r();function a(){let r=n(),i=e(),a=t();function o(e=`[ 无标题 ]`){return typeof e==`function`?e():e}function s(e){a.setActived(e),(i.settings.menu.mainMenuClickMode===`jump`||i.settings.menu.mainMenuClickMode===`smart`&&a.sidebarMenusHasOnlyMenu)&&r.push(a.sidebarMenusFirstDeepestPath)}return{generateTitle:o,switchTo:s}}export{i as n,a as t};