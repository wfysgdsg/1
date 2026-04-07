/**
 * 新增记录云函数（带认证）
 * 整理日期：2024-03-26
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 校验用户登录状态
 */
async function checkAuth(userId, sessionToken) {
  if (!userId || !sessionToken) {
    throw new Error('登录状态已失效，请重新登录');
  }

  const userRes = await db.collection('users').doc(userId).get();
  const user = userRes.data;

  if (!user) {
    throw new Error('用户不存在');
  }

  if (user.sessionToken !== sessionToken) {
    throw new Error('登录状态已失效，请重新登录');
  }

  const expireAt = user.sessionExpireAt ? new Date(user.sessionExpireAt).getTime() : 0;
  // 修复：当 expireAt 为 0 时不视为过期（表示永久有效或未设置）
  if (expireAt > 0 && expireAt <= Date.now()) {
    throw new Error('登录已过期，请重新登录');
  }

  // 续期 Session
  await db.collection('users').doc(userId).update({
    data: { sessionExpireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
  });

  return user;
}

exports.main = async (event, context) => {
  const { userId, sessionToken, type, goodsName, quantity, customerName, salePrice, costPrice, date } = event;

  try {
    // 1. 校验登录状态
    const userInfo = await checkAuth(userId, sessionToken);

    // 2. 查找商品
    const goodsRes = await db.collection('goods')
      .where({ name: db.RegExp({ regexp: goodsName, options: 'i' }) })
      .get();

    if (!goodsRes.data || goodsRes.data.length === 0) {
      return { success: false, message: '未找到商品: ' + goodsName };
    }

    const goods = goodsRes.data[0];
    const recordDate = date || new Date().toISOString().split('T')[0];

    // 3. 借货类型
    if (type === 'borrow') {
      const borrowRecord = {
        goodsId: goods._id,
        goodsName: goods.name,
        unit: goods.unit || '',
        costPrice: goods.costPrice,
        quantity: parseFloat(quantity),
        borrowDate: recordDate,
        remark: '',
        status: 'pending',
        borrowerId: userId,
        borrowerName: userInfo.name || userInfo.username,
        createTime: db.serverDate(),
      };

      await db.collection('borrow').add({ data: borrowRecord });

      return {
        success: true,
        message: '借货记录已添加：' + goods.name + ' x ' + quantity + (goods.unit || '')
      };
    }

    // 4. 销售类型
    if (type === 'sale') {
      if (!customerName) {
        return { success: false, message: '销售记录需要提供送货单位' };
      }

      const customerRes = await db.collection('customer')
        .where({ name: db.RegExp({ regexp: customerName, options: 'i' }) })
        .get();

      let customerId = '';
      let customerFinalName = customerName;
      if (customerRes.data && customerRes.data.length > 0) {
        customerId = customerRes.data[0]._id;
        customerFinalName = customerRes.data[0].name;
      }

      const finalSalePrice = salePrice ? parseFloat(salePrice) : goods.salePrice;
      const finalCostPrice = costPrice ? parseFloat(costPrice) : goods.costPrice;
      const qty = parseFloat(quantity);
      const profit = (finalSalePrice - finalCostPrice) * qty;

      const saleRecord = {
        goodsDetail: [{
          goodsId: goods._id,
          goodsName: goods.name,
          unit: goods.unit || '',
          quantity: qty,
          salePrice: finalSalePrice,
          costPrice: finalCostPrice,
          profit: profit,
        }],
        customerId: customerId,
        customerName: customerFinalName,
        totalAmount: finalSalePrice * qty,
        totalCost: finalCostPrice * qty,
        totalProfit: profit,
        saleDate: recordDate,
        saleTime: new Date(recordDate).getTime(),
        sellerId: userId,
        sellerName: userInfo.name || userInfo.username,
        createTime: db.serverDate(),
      };

      await db.collection('sale').add({ data: saleRecord });

      return {
        success: true,
        message: '销售记录已添加：' + goods.name + ' x ' + quantity + (goods.unit || '') + ' -> ' + customerFinalName
      };
    }

    return { success: false, message: '未知类型，请使用 borrow 或 sale' };

  } catch (err) {
    console.error('addRecord 云函数失败:', err);
    return { success: false, message: err.message || '添加失败' };
  }
};
