/**
 * 数据库通用操作封装
 * 整理日期：2024-03-26
 * 修复日期：2026-05-25
 * 修复：fetchAll 支持工厂函数模式，每次循环重建 query 避免 skip/limit 失效
 */

/**
 * 延迟函数
 * @param {number} ms 延迟毫秒数
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 分页获取集合中所有数据 (绕过小程序 limit 20/100 限制)
 * @param {Object|Function} queryOrFactory 数据库查询对象 或 工厂函数（推荐，避免 query 复用失效）
 * @param {Object} options 配置项
 * @param {number} options.pageSize 每页数量，默认 20（微信小程序端单次上限即20）
 * @param {number} options.maxPages 最大页数，默认 100
 * @param {number} options.delayMs 每页请求间隔，防止频率限制
 * @returns {Promise<Array>} 返回合并后的完整数组
 */
async function fetchAll(queryOrFactory, options = {}) {
  const pageSize = Math.min(options.pageSize || 20, 20);
  const maxPages = options.maxPages || 100;
  const delayMs = options.delayMs || 0;

  let allResults = [];
  let offset = 0;

  for (let i = 0; i < maxPages; i++) {
    // 工厂函数模式：每次循环调用工厂获取全新 query，避免 skip/limit 失效
    const query = typeof queryOrFactory === 'function' ? queryOrFactory() : queryOrFactory;

    if (delayMs > 0 && i > 0) {
      await sleep(delayMs);
    }

    const res = await query.skip(offset).limit(pageSize).get();
    const data = res.data || [];

    if (data.length === 0) break;

    allResults = allResults.concat(data);
    offset += data.length;

    // 返回数量不满一页说明已到末尾
    if (data.length < pageSize) break;
  }

  return allResults;
}

/**
 * 正则元字符转义，防 ReDoS/注入
 */
function escapeRegExp(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function debounce(fn, delay) {
  var timer = null;
  return function() {
    var ctx = this, args = arguments;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function() { fn.apply(ctx, args); }, delay || 350);
  };
}

/**
 * 云函数调用封装：自动处理登录过期，踢回登录页
 */
function callCloud(name, data, options) {
  return wx.cloud.callFunction(Object.assign({ name: name, data: data }, options || {}))
    .then(function (res) { return res; })
    .catch(function (err) {
      var msg = (err && err.message) || '';
      if (msg.indexOf('登录状态已失效') >= 0 || msg.indexOf('登录已过期') >= 0) {
        wx.removeStorageSync('userInfo');
        wx.removeStorageSync('sessionToken');
        wx.reLaunch({ url: '/pages/login/login' });
      }
      throw err;
    });
}

module.exports = {
  fetchAll,
  escapeRegExp,
  debounce,
  callCloud
};
