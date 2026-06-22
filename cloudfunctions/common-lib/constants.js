/**
 * 税率常量（云函数端统一版本）
 * 硬件含税价 ÷1.13 = 不含税收入，软件含税价 ÷1.06 = 不含税收入
 * 所有云函数应通过 require('common-lib/constants') 引用此文件，不再各自复制
 * ★ 与 utils/constants.js 保持一致，修改时同步另一份
 */
var TAX_RATES = {
  HARDWARE: 1.13,
  SOFTWARE: 1.06
};

module.exports = { TAX_RATES: TAX_RATES };
