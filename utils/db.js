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
  
  try {
    // 1. 先获取总数
    const countRes = await query.count();
    const total = countRes.total;
    
    if (total === 0) return [];

    // 2. 根据总数分批获取
    const totalPages = Math.ceil(total / pageSize);
    const pagesToFetch = Math.min(totalPages, maxPages);

    for (let i = 0; i < pagesToFetch; i++) {
      const res = await query.skip(i * pageSize).limit(pageSize).get();
      const data = res.data || [];
      
      if (data.length === 0) break;

      allResults = allResults.concat(data);
      
      // 如果已经拿到了全部数据，提前退出
      if (allResults.length >= total) break;

      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }
  } catch (err) {
    console.error('fetchAll count error, fallback to legacy mode:', err);
    // 回退到旧逻辑，但改进退出条件
    for (let i = 0; i < maxPages; i++) {
      const res = await query.skip(i * pageSize).limit(pageSize).get();
      const data = res.data || [];
      
      if (data.length === 0) break;

      const lastCount = allResults.length;
      allResults = allResults.concat(data);
      
      // 如果本次没有新增数据，说明已经拿完（虽然 skip 应该会保证不重复，但以防万一）
      if (allResults.length === lastCount) break;

      // 在回退模式下，如果返回的数据量明显少于 pageSize 且不等于环境常见的限制(20)，大概率是拿完了
      // 但由于环境限制不确定，这里我们保守一点，只靠 data.length === 0 或 maxPages 退出
      
      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }
  }
  
  return allResults;
}

module.exports = {
  fetchAll
};
