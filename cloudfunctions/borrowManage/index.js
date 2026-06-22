/**
 * 借货管理云函数（事务版）
 * 功能：原子性处理借货录入、归还货品，确保记录和库存操作同时成功或回滚
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const { checkAuth } = require('./auth');
const { BusinessError } = require('./errors');

async function handleBorrow(event) {
  const { userId, selectedGoods, selectedLocation, borrowDate, remark } = event;

  if (!selectedGoods || !selectedGoods.length) {
    return { success: false, message: '请选择商品' };
  }
  if (!selectedLocation || !selectedLocation._id) {
    return { success: false, message: '请选择客户' };
  }
  if (!borrowDate) {
    return { success: false, message: '请选择借货日期' };
  }

  const user = await checkAuth(userId, event.sessionToken);
  const userName = user.name || user.username || '';
  const locId = selectedLocation._id;
  const locName = selectedLocation.name || selectedLocation.locationName || '';
  const borrowDateTime = new Date(borrowDate).getTime();

  const validGoods = selectedGoods.filter(g => Number(g.quantity || 0) > 0);
  if (!validGoods.length) {
    return { success: false, message: '请填写借货数量' };
  }

  const transaction = await db.startTransaction();

  try {
    const results = [];

    for (const item of validGoods) {
      const qty = Number(item.quantity || 0);
      const goodsId = item._id;
      const goodsName = item.name || '';
      const costPrice = Number(item.costPrice || 0);
      const salePrice = Number(item.salePrice || 0);
      const unit = item.unit || '';

      const borrowAddRes = await transaction.collection('borrow').add({
        data: {
          type: 'borrow',     // 显式标记为真实借货
          goodsId, goodsName, quantity: qty, costPrice, salePrice, unit,
          locationId: locId,
          locationName: locName,
          borrowerId: userId,
          borrowerName: userName,
          borrowDate: borrowDateTime,
          remark: remark || '',
          status: 'pending',
          createTime: db.serverDate(),
          updateTime: db.serverDate(),
        }
      });

      const stockRes = await transaction.collection('user_goods').where({
        userId, goodsId,
      }).get();

      if (stockRes.data.length > 0) {
        await transaction.collection('user_goods').doc(stockRes.data[0]._id).update({
          data: {
            stock: _.inc(qty),
            updateTime: db.serverDate(),
          }
        });
      } else {
        await transaction.collection('user_goods').add({
          data: {
            userId, userName, goodsId, goodsName,
            stock: qty, unit,
            createTime: db.serverDate(),
            updateTime: db.serverDate(),
          }
        });
      }

      results.push({ goodsId, goodsName, quantity: qty, borrowId: borrowAddRes._id });
    }

    await transaction.commit();

    return {
      success: true,
      message: `借货成功，共 ${results.length} 项商品`,
      data: results,
    };

  } catch (txError) {
    await transaction.rollback();
    throw txError;
  }
}

async function handleReturnGoods(event) {
  const { userId, sessionToken, goodsId, quantity, borrowId } = event;
  const fullQty = parseFloat(quantity);

  if (!goodsId || !borrowId || !quantity || isNaN(fullQty) || fullQty <= 0) {
    return { success: false, message: '参数不完整' };
  }

  await checkAuth(userId, sessionToken);

  const transaction = await db.startTransaction();

  try {
    // 0. 拉取借货记录并校验
    const borrowRes = await transaction.collection('borrow').doc(borrowId).get();
    const borrow = borrowRes.data;
    if (!borrow) throw new Error('借货记录不存在');

    // ★ 校验归属
    if (borrow.borrowerId !== userId) {
      throw new Error('无权操作他人借货记录');
    }

    // ★ 校验状态
    if (borrow.status !== 'pending') {
      throw new Error('该借货已处理（状态：' + borrow.status + '）');
    }

    // ★ 校验归还数量
    const borrowQty = parseFloat(borrow.quantity);
    if (fullQty > borrowQty - 0.01) {
      throw new Error('归还数量无效，当前借货 ' + borrowQty + ' 件');
    }

    // A. 扣减个人库存（带 stock >= qty 条件）
    const stockUpdate = await transaction.collection('user_goods').where({
      userId,
      goodsId,
      stock: _.gte(fullQty)   // ★ 防止并发导致负库存
    }).update({
      data: {
        stock: _.inc(-fullQty),
        updateTime: db.serverDate(),
      }
    });

    if (stockUpdate.stats.updated === 0) {
      throw new Error('库存不足，无法归还（可能是并发冲突）');
    }

    // B. 更新借货记录状态
    const newStatus = (fullQty >= borrowQty - 0.01) ? 'returned' : 'partial';
    await transaction.collection('borrow').doc(borrowId).update({
      data: {
        status: newStatus,
        returnQty: (borrow.returnQty || 0) + fullQty,
        returnTime: db.serverDate(),
        updateTime: db.serverDate(),
      }
    });

    await transaction.commit();

    return { success: true, message: '归还成功' };

  } catch (txError) {
    await transaction.rollback();
    throw txError;
  }
}

exports.main = async (event, context) => {
  const { action } = event;

  try {
    if (action === 'returnGoods') {
      return await handleReturnGoods(event);
    }

    // 默认处理借货（兼容旧调用）
    return await handleBorrow(event);

  } catch (err) {
    console.error('borrowManage 错误:', err);
    // ★ M7: 区分业务错误和系统错误
    if (err instanceof BusinessError) {
      return { success: false, message: err.message };
    }
    return { success: false, message: '服务器错误，请稍后重试' };
  }
};
