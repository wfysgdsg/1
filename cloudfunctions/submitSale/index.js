/**
 * 提交销售单云函数 (使用数据库事务)
 * 功能：处理销售单入库、扣减库存、更新借货状态
 * 整理日期：2024-03-26
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
  if (expireAt <= Date.now()) {
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

  try {
    // 1. 校验权限
    const user = await checkAuth(userId, sessionToken);

    // 2. 准备销售单数据
    // 使用分单位进行中间计算，防止精度丢失
    const totalAmountCents = selectedGoods.reduce((sum, g) => sum + Math.round(parseFloat(g.quantity) * Number(g.salePrice || 0) * 100), 0);
    const totalCostCents = selectedGoods.reduce((sum, g) => sum + Math.round(parseFloat(g.quantity) * Number(g.costPrice || 0) * 100), 0);
    const totalProfitCents = selectedGoods.reduce((sum, g) => sum + Math.round(parseFloat(g.profit || 0) * 100), 0);

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
      totalAmount: totalAmountCents / 100,
      totalCost: totalCostCents / 100,
      totalProfit: totalProfitCents / 100,
      saleDate: new Date(saleDate).getTime(),
      saleTime: new Date(saleDate).getTime(),
      payStatus: payStatus || 'paid',
      payTime: payStatus === 'paid' ? db.serverDate() : null,
      remark: remark || '',
      createTime: db.serverDate(),
      updateTime: db.serverDate(),
      importMode: !!importMode
    };

    // 3. 使用数据库事务处理数据一致性
    const result = await db.runTransaction(async transaction => {
      // A. 插入销售记录
      const saleAddRes = await transaction.collection('sale').add({ data: saleRecord });
      const saleId = saleAddRes._id;

      // B. 更新个人库存 (user_goods)
      for (const g of selectedGoods) {
        const qty = parseFloat(g.quantity);
        if (qty <= 0) continue;

        const userGoodsColl = transaction.collection('user_goods');
        const userGoodsRes = await userGoodsColl.where({
          userId: userId,
          goodsId: g._id
        }).get();

        if (userGoodsRes.data.length > 0) {
          const ug = userGoodsRes.data[0];
          await userGoodsColl.doc(ug._id).update({
            data: {
              stock: _.inc(-qty),
              updateTime: db.serverDate()
            }
          });
        } else {
          // 如果库存记录不存在，则创建一条
          await userGoodsColl.add({
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
        const borrowColl = transaction.collection('borrow');
        // 事务中不支持 where().update()，需要循环处理或使用其他方式
        // 但我们可以获取记录 ID 后依次更新
        for (const borrowId of importIds) {
          await borrowColl.doc(borrowId).update({
            data: {
              status: 'sold',
              saleId: saleId,
              updateTime: db.serverDate()
            }
          });
        }
      }

      return {
        saleId: saleId
      };
    });

    return {
      success: true,
      saleId: result.saleId,
      message: '提交成功'
    };

  } catch (err) {
    console.error('提交销售单失败:', err);
    return {
      success: false,
      message: err.message || '服务器内部错误'
    };
  }
};
