/**
 * 提交销售单云函数
 * 功能：处理销售单入库、扣减库存、更新借货状态
 * 修复：添加事务支持，确保数据一致性
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 校验用户登录状态
 */
async function checkAuth(userId, token, needRoot = false) {
  if (!userId || !token) {
    throw new Error('登录状态已失效，请重新登录');
  }

  const userRes = await db.collection('users').doc(userId).get();
  const user = userRes.data;

  if (!user) {
    throw new Error('用户不存在');
  }

  if (user.sessionToken !== token) {
    throw new Error('登录状态已失效，请重新登录');
  }

  const expireAt = user.sessionExpireAt ? new Date(user.sessionExpireAt).getTime() : 0;
  // 修复：当 expireAt 为 0 或未设置时不视为过期，只有明确设置了过期时间且已过期才拒绝
  if (expireAt > 0 && expireAt <= Date.now()) {
    throw new Error('登录已过期，请重新登录');
  }

  if (needRoot && user.role !== 'root') {
    throw new Error('没有权限执行该操作');
  }

  // 续期 Session
  const newExpire = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.collection('users').doc(userId).update({
    data: { sessionExpireAt: newExpire }
  });

  return user;
}

exports.main = async (event, context) => {
  const { userId, sessionToken, selectedContact, selectedGoods, saleDate, payStatus, remark, importMode, importIds } = event;

  let transaction;

  try {
    // 1. 校验权限
    const user = await checkAuth(userId, sessionToken);

    // 2. 验证库存是否充足（防止负库存）
    const goodsIds = selectedGoods.map(g => g._id);
    const stockRes = await db.collection('user_goods').where({
      userId: userId,
      goodsId: _.in(goodsIds)
    }).get();

    const stockMap = {};
    (stockRes.data || []).forEach(item => {
      stockMap[item.goodsId] = item.stock || 0;
    });

    // 检查每种商品的库存
    for (const g of selectedGoods) {
      const qty = parseFloat(g.quantity);
      if (qty <= 0) continue;

      const currentStock = stockMap[g._id] || 0;
      if (currentStock < qty) {
        return {
          success: false,
          message: `库存不足：${g.name} 当前库存 ${currentStock}，需要 ${qty}`
        };
      }
    }

    // 3. 准备销售单数据
    const totalAmount = selectedGoods.reduce((sum, g) => sum + (parseFloat(g.quantity) * Number(g.salePrice || 0)), 0);
    const totalCost = selectedGoods.reduce((sum, g) => sum + (parseFloat(g.quantity) * Number(g.costPrice || 0)), 0);
    const totalProfit = selectedGoods.reduce((sum, g) => sum + (parseFloat(g.profit) || 0), 0);

    const saleRecord = {
      sellerId: userId,
      sellerName: user.name || user.username,
      contactId: selectedContact._id,
      contactName: selectedContact.name,
      locationId: selectedContact.locationId || '',
      locationName: selectedContact.locationName || '',
      goodsDetail: selectedGoods.map(g => ({
        goodsId: g._id,
        goodsName: g.name,
        unit: g.unit,
        quantity: parseFloat(g.quantity),
        costPrice: Number(g.costPrice),
        salePrice: Number(g.salePrice),
        profit: parseFloat(g.profit)
      })),
      totalAmount,
      totalCost,
      totalProfit,
      saleDate: new Date(saleDate).getTime(),
      saleTime: new Date(saleDate).getTime(),
      payStatus: payStatus || 'paid',
      payTime: payStatus === 'paid' ? db.serverDate() : null,
      remark: remark || '',
      createTime: db.serverDate(),
      updateTime: db.serverDate(),
      importMode: !!importMode
    };

    // 4. 开启事务确保数据一致性
    transaction = await db.startTransaction();

    try {
      // A. 插入销售记录
      const saleAddRes = await transaction.collection('sale').add({ data: saleRecord });
      const saleId = saleAddRes._id;

      // B. 更新个人库存 (user_goods) - 使用事务
      for (const g of selectedGoods) {
        const qty = parseFloat(g.quantity);
        if (qty <= 0) continue;

        // 尝试原子减库存
        const updateRes = await transaction.collection('user_goods').where({
          userId: userId,
          goodsId: g._id
        }).update({
          data: {
            stock: _.inc(-qty),
            updateTime: db.serverDate()
          }
        });

        // 如果库存记录不存在，创建一条（允许负库存）
        if (updateRes.stats.updated === 0) {
          await transaction.collection('user_goods').add({
            data: {
              userId: userId,
              goodsId: g._id,
              goodsName: g.name,
              stock: -qty,
              updateTime: db.serverDate()
            }
          });
        }
      }

      // C. 如果是导入模式，更新原借货单状态
      if (importMode && importIds && importIds.length > 0) {
        await transaction.collection('borrow').where({
          _id: _.in(importIds)
        }).update({
          data: {
            status: 'sold',
            saleId: saleId,
            updateTime: db.serverDate()
          }
        });
      }

      // 提交事务
      await transaction.commit();

      return {
        success: true,
        saleId: saleId,
        message: '提交成功'
      };

    } catch (txError) {
      // 回滚事务
      await transaction.rollback();
      throw txError;
    }

  } catch (err) {
    console.error('提交销售单失败:', err);
    // 只有在事务已开启的情况下才尝试回滚
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackErr) {
        console.error('事务回滚失败:', rollbackErr);
      }
    }
    return {
      success: false,
      message: err.message || '服务器内部错误'
    };
  }
};
