
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.hurui.me
 */
  
function e(e,t=`YYYY-MM-DD hh:mm:ss`){let n=new Date(e).getTime(),r=new Date(n),i=t.replace(`YYYY`,r.getFullYear().toString());return i=i.replace(`MM`,`0${r.getMonth()+1}`.slice(-2)),i=i.replace(`DD`,`0${r.getDate()}`.slice(-2)),i=i.replace(`hh`,`0${r.getHours()}`.slice(-2)),i=i.replace(`mm`,`0${r.getMinutes()}`.slice(-2)),i=i.replace(`ss`,`0${r.getSeconds()}`.slice(-2)),i}export{e as t};