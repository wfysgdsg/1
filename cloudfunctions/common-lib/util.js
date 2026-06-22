/**
 * 公共工具函数
 */

/**
 * 统一日期转为毫秒时间戳
 */
function toTs(d) {
  if (d == null || d === '') return Date.now();
  if (typeof d === 'number') return d;
  var t = new Date(d).getTime();
  return isNaN(t) ? Date.now() : t;
}

/**
 * 正则元字符转义，防止 ReDoS / 注入
 */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { toTs: toTs, escapeRegExp: escapeRegExp };
