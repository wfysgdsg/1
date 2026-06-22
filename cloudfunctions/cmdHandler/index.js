/**
 * 命令处理云函数
 * 功能：解析自然语言命令，执行借货/销售/库存查询
 * 已修复：接入统一鉴权 checkAuth + 正则转义 + 错误脱敏
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { checkAuth } = require('./auth');
const { escapeRegExp, toTs } = require('./util');

/**
 * 解析并执行命令
 */
async function parseCommand(cmd, userId) {
  var text = cmd.trim();

  if (text.startsWith('借货') || text.startsWith('进货')) {
    return handleBorrow(text, userId);
  }
  if (text.startsWith('销售') || text.startsWith('卖')) {
    return handleSale(text, userId);
  }
  if (text.startsWith('库存') || text.startsWith('查询')) {
    return handleInventory(text, userId);
  }
  return null;
}

async function handleBorrow(cmd, userId) {
  // ★ 修复：要求商品名与数量间有空格，避免商品名含数字时被错误截断
  var match = cmd.match(/借货\s+(.+?)\s+(\d+(?:\.\d+)?)\s*(\S{1,4})?/);
  if (!match) {
    return '格式不对，请用: 借货 商品名 数量 单位\n例如: 借货 彩钢1150xk 10 米';
  }

  var goodsName = escapeRegExp(match[1].trim());
  var quantity = parseFloat(match[2]);
  var unit = match[3] || '';

  var goodsRes = await db.collection('goods')
    .where({ name: db.RegExp({ regexp: goodsName, options: 'i' }) })
    .limit(1).get();

  if (goodsRes.data.length === 0) return '未找到商品: ' + goodsName;
  var goods = goodsRes.data[0];

  var transaction = await db.startTransaction();
  try {
    await transaction.collection('borrow').add({
      data: {
        goodsId: goods._id, goodsName: goods.name,
        unit: goods.unit || unit, costPrice: goods.costPrice,
        quantity: quantity, borrowDate: toTs(),
        locationId: '', locationName: '',
        remark: 'QQ语音创建', status: 'pending',
        borrowerId: userId, createTime: db.serverDate()
      }
    });

    var stockRes = await transaction.collection('user_goods').where({
      userId: userId, goodsId: goods._id
    }).get();

    if (stockRes.data.length > 0) {
      await transaction.collection('user_goods').doc(stockRes.data[0]._id).update({
        data: { stock: db.command.inc(quantity) }
      });
    } else {
      await transaction.collection('user_goods').add({
        data: { userId: userId, goodsId: goods._id, goodsName: goods.name, unit: goods.unit || unit, stock: quantity }
      });
    }
    await transaction.commit();
  } catch (txErr) {
    await transaction.rollback();
    console.error('借货事务失败:', txErr);
    throw new Error('操作失败，请稍后重试');
  }
  return '✅ 借货成功！\n商品: ' + goods.name + '\n数量: ' + quantity + (goods.unit || unit);
}

async function handleSale(cmd, userId) {
  // ★ 修复：要求商品名与数量间有空格
  var match = cmd.match(/销售\s+(.+?)\s+(\d+(?:\.\d+)?)\s*(\S{1,4})?\s*(?:给\s+(.+?))?$/);
  if (!match) return '格式不对，请用: 销售 商品名 数量 单位 [给 公司名]';

  var goodsName = escapeRegExp(match[1].trim());
  var quantity = parseFloat(match[2]);
  var unit = match[3] || '';
  var customerName = match[4] ? escapeRegExp(match[4].trim()) : '';

  var goodsRes = await db.collection('goods')
    .where({ name: db.RegExp({ regexp: goodsName, options: 'i' }) })
    .limit(1).get();
  if (goodsRes.data.length === 0) return '未找到商品: ' + goodsName;
  var goods = goodsRes.data[0];

  // 事务内校验+扣减库存（防止竞态）
  var transaction = await db.startTransaction();
  try {
    var stockRes = await transaction.collection('user_goods').where({
      userId: userId, goodsId: goods._id
    }).get();

    if (stockRes.data.length === 0 || (stockRes.data[0].stock || 0) < quantity) {
      await transaction.rollback();
      return '库存不足！当前库存: ' + (stockRes.data[0] ? stockRes.data[0].stock : 0) + '\n需要: ' + quantity;
    }

    await transaction.collection('user_goods').doc(stockRes.data[0]._id).update({
      data: { stock: db.command.inc(-quantity) }
    });

    // 查找客户
    var customerId = '';
    if (customerName) {
      var custRes = await transaction.collection('customer')
        .where({ name: db.RegExp({ regexp: customerName, options: 'i' }) })
        .limit(1).get();
      if (custRes.data.length > 0) customerId = custRes.data[0]._id;
    }

    var totalInvoiceAmount = goods.salePrice * quantity;

    await transaction.collection('sale').add({
      data: {
        customerId: customerId, customerName: customerName || '未指定',
        goodsDetail: [{ goodsId: goods._id, goodsName: goods.name, unit: goods.unit || unit, quantity: quantity, salePrice: goods.salePrice, costPrice: goods.costPrice }],
        totalInvoiceAmount: totalInvoiceAmount,
        totalAmount: totalInvoiceAmount, totalCost: goods.costPrice * quantity, totalProfit: totalInvoiceAmount - goods.costPrice * quantity,
        saleDate: toTs(), saleTime: toTs(),
        remark: 'QQ语音创建', sellerId: userId, createTime: db.serverDate()
      }
    });

    await transaction.commit();
  } catch (txErr) {
    await transaction.rollback();
    console.error('销售事务失败:', txErr);
    throw new Error('操作失败，请稍后重试');
  }

  return '✅ 销售成功！\n商品: ' + goods.name + '\n数量: ' + quantity + (goods.unit || unit) +
    '\n客户: ' + (customerName || '未指定') + '\n金额: ¥' + (goods.salePrice * quantity);
}

async function handleInventory(cmd, userId) {
  var keyword = cmd.replace(/库存|查询/g, '').trim();
  if (!keyword) {
    var allRes = await db.collection('user_goods').where({ userId: userId }).get();
    if (allRes.data.length === 0) return '暂无库存记录';
    var text = '📦 你的库存:\n';
    allRes.data.forEach(function (item) {
      text += item.goodsName + ': ' + item.stock + (item.unit || '') + '\n';
    });
    return text;
  }
  var searchRes = await db.collection('user_goods').where({
    userId: userId,
    goodsName: db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })
  }).limit(1).get();
  if (searchRes.data.length === 0) return '未找到商品: ' + keyword;
  var item = searchRes.data[0];
  return '📦 ' + item.goodsName + ': ' + item.stock + (item.unit || '');
}

exports.main = async (event, context) => {
  var message = event.message;
  var senderId = event.senderId;
  var sessionToken = event.sessionToken;

  try {
    // 必须校验 sessionToken，不再裸查 userId
    await checkAuth(senderId, sessionToken);
    var result = await parseCommand(message, senderId);
    return { success: true, result: result };
  } catch (err) {
    console.error('cmdHandler 错误:', err);
    // 错误脱敏：只回传 message，不暴露原始 error 对象
    return { success: false, message: err.message || '操作失败' };
  }
};
