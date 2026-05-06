
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.hurui.me
 */
  
var e={"+":`inserted`,"-":`deleted`,"@":`meta`},t={name:`diff`,token:function(t){var n=t.string.search(/[\t ]+?$/);if(!t.sol()||n===0)return t.skipToEnd(),(`error `+(e[t.string.charAt(0)]||``)).replace(/ $/,``);var r=e[t.peek()]||t.skipToEnd();return n===-1?t.skipToEnd():t.pos=n,r}};export{t as diff};