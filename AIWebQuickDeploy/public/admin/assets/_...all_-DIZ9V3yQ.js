
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.hurui.me
 */
  
import{At as e,D as t,E as n,O as r,W as i,Z as a,cn as o,q as s,ut as c,w as l,x as u,xt as d}from"./vue.runtime.esm-bundler-C3TPsVo8.js";import{t as f}from"./settings-DA_S6N2d.js";import{a as p,s as m}from"./vue-router-DFzuDPgw.js";import{t as h}from"./SvgIcon-CPa4sPlN.js";var g={class:`absolute left-[50%] top-[50%] flex flex-col items-center justify-between lg-flex-row -translate-x-50% -translate-y-50% lg-gap-12`},_={class:`flex flex-col gap-4`},v=r({__name:`[...all]`,setup(r){let v=f(),y=m(),b=d({inter:NaN,countdown:5});p(()=>{b.value.inter&&window.clearInterval(b.value.inter)}),i(()=>{b.value.inter=window.setInterval(()=>{b.value.countdown--,b.value.countdown===0&&(b.value.inter&&window.clearInterval(b.value.inter),x())},1e3)});function x(){y.push(v.settings.app.home.fullPath)}return(r,i)=>{let d=h,f=a(`el-button`);return s(),l(`div`,g,[t(d,{name:`404`,class:`text-[300px] lg-text-[400px]`}),u(`div`,_,[i[0]||(i[0]=u(`h1`,{class:`m-0 text-6xl font-sans`},`404`,-1)),i[1]||(i[1]=u(`div`,{class:`mx-0 text-xl text-stone-5`},`抱歉，你访问的页面不存在`,-1)),u(`div`,null,[t(f,{type:`primary`,onClick:x},{default:c(()=>[n(o(e(b).countdown)+` 秒后，返回首页 `,1)]),_:1})])])])}}});export{v as default};