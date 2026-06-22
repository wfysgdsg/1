/**
 * 全局常量（前端版）
 * 税率逻辑：硬件含税价 ÷1.13 = 不含税收入，软件含税价 ÷1.06 = 不含税收入
 * ★ 与 cloudfunctions/common-lib/constants.js 保持一致，修改时同步另一份
 */
var TAX_RATES = {
  HARDWARE: 1.13,
  SOFTWARE: 1.06
};

module.exports = { TAX_RATES: TAX_RATES };
