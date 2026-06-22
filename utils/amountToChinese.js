/**
 * 金额转中文大写（人民币）
 * 例：2450 → "贰仟肆佰伍拾元整"
 *    1234.56 → "壹仟贰佰叁拾肆元伍角陆分"
 */
function amountToChinese(num) {
  if (num === 0 || num === '0' || num === undefined || num === null) return '零元整';

  var n = parseFloat(num);
  if (isNaN(n)) return '零元整';
  if (n === 0) return '零元整';

  var digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  var radices = ['', '拾', '佰', '仟'];
  var bigRadices = ['', '万', '亿'];

  // 处理小数
  var decimals = Math.round((n - Math.floor(n)) * 100);
  var jiao = Math.floor(decimals / 10);
  var fen = decimals % 10;

  // 处理整数部分
  var intPart = Math.floor(n);
  var result = '';
  var zeroCount = 0;
  var strInt = String(intPart);

  if (strInt === '0') {
    result = '零';
  } else {
    var len = strInt.length;
    for (var i = 0; i < len; i++) {
      var p = len - i - 1;
      var d = parseInt(strInt[i]);
      var quotient = Math.floor(p / 4);
      var modulus = p % 4;

      if (d === 0) {
        zeroCount++;
      } else {
        if (zeroCount > 0) {
          result += '零';
          zeroCount = 0;
        }
        result += digits[d] + radices[modulus];
      }

      if (modulus === 0 && zeroCount < 4) {
        result += bigRadices[quotient];
        zeroCount = 0;
      }
    }
  }

  result += '元';

  // 角分处理
  if (jiao === 0 && fen === 0) {
    result += '整';
  } else {
    if (jiao > 0) {
      result += digits[jiao] + '角';
    }
    if (fen > 0) {
      result += digits[fen] + '分';
    }
  }

  return result;
}

/**
 * 格式化金额为千分位字符串
 */
function formatMoney(num) {
  var n = parseFloat(num);
  if (isNaN(n)) return '0.00';
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 金额转"佰拾万元角分"格式（用于表格头部）
 */
function amountToFormal(num) {
  var n = parseFloat(num);
  if (isNaN(n) || n === 0) return '零元零角零分';
  return amountToChinese(n).replace('整', '');
}

module.exports = { amountToChinese, formatMoney, amountToFormal };
