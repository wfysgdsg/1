/**
 * 金额处理工具类 (以分为单位进行计算，规避浮点数精度问题)
 */

/**
 * 将元转换为分
 * @param {string|number} yuan 
 * @returns {number} 分
 */
function yuanToCents(yuan) {
  if (typeof yuan === 'string') {
    yuan = parseFloat(yuan);
  }
  if (isNaN(yuan)) return 0;
  return Math.round(yuan * 100);
}

/**
 * 将分转换为元 (保留2位小数的字符串)
 * @param {number} cents 
 * @returns {string} 元
 */
function centsToYuan(cents) {
  if (isNaN(cents)) return '0.00';
  return (cents / 100).toFixed(2);
}

/**
 * 高精度乘法 (结果取分)
 * @param {number} cents 
 * @param {number} factor 
 * @returns {number} 分
 */
function multiply(cents, factor) {
  return Math.round(cents * factor);
}

/**
 * 高精度除法 (结果取分)
 * @param {number} cents 
 * @param {number} divisor 
 * @returns {number} 分
 */
function divide(cents, divisor) {
  return Math.round(cents / divisor);
}

module.exports = {
  yuanToCents,
  centsToYuan,
  multiply,
  divide
};
