/**
 * 数据库通用操作封装
 * 整理日期：2024-03-26
 */

/**
 * 延迟函数
 * @param {number} ms 延迟毫秒数
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 分页获取集合中所有数据 (绕过小程序 limit 20/100 限制)
 * @param {Object} query 数据库查询对象 (如 db.collection('xxx').where({...}))
 * @param {Object} options 配置项
 * @param {number} options.pageSize 每页数量，默认 100
 * @param {number} options.maxPages 最大页数，默认 100
 * @param {number} options.delayMs 每页请求间隔，防止频率限制
 * @returns {Promise<Array>} 返回合并后的完整数组
 */
async function fetchAll(query, options = {}) {
  const pageSize = options.pageSize || 100;
  const maxPages = options.maxPages || 100;
  const delayMs = options.delayMs || 0;
  
  let allResults = [];
  
  for (let i = 0; i < maxPages; i++) {
    // 关键修复：确保 query 对象能够正确链式调用 skip 和 limit
    const res = await query.skip(i * pageSize).limit(pageSize).get();
    const data = res.data || [];
    
    // 如果没有数据了，直接退出
    if (data.length === 0) {
      break;
    }

    allResults = allResults.concat(data);
    
    // 如果返回数据少于一页，说明已经是最后一页
    if (data.length < pageSize) {
      break;
    }
    
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }
  
  return allResults;
}

module.exports = {
  fetchAll
};
