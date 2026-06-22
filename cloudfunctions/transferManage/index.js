/**
 * 调货管理云函数（事务版）
 * 功能：原子性处理调货接收，确保原借货状态、新借货记录、双方库存操作同时成功或回滚
 * 修复：使用 db.runTransaction 确保调货流程数据一致性
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const { checkAuth } = require('./auth');

exports.main = async (event, context) => {
  const { userId, sessionToken, transferRequestId, action } = event;

  try {
    // 新增：创建调货请求（替代前端直写）
    if (action === 'createTransfer') {
      return await handleCreateTransfer(event);
    }

    // action: 'accept' | 'reject'
    if (!transferRequestId || !action) {
      return { success: false, message: '参数不完整' };
    }
    if (action !== 'accept' && action !== 'reject') {
      return { success: false, message: '未知操作' };
    }

    // 1. 权限校验
    const user = await checkAuth(userId, sessionToken);

    // 2. 查询调货请求
    const reqRes = await db.collection('transfer_requests').doc(transferRequestId).get();
    const transferReq = reqRes.data;
    if (!transferReq) {
      return { success: false, message: '调货请求不存在' };
    }

    // 3. 权限校验：只有接收人能操作
    if (transferReq.receiverId !== userId) {
      return { success: false, message: '无权操作此调货请求' };
    }

    if (transferReq.status !== 'pending') {
      return { success: false, message: '该请求已被处理' };
    }

    const goodsList = transferReq.goodsList || [];
    if (!goodsList.length) {
      return { success: false, message: '调货商品列表为空' };
    }

    if (action === 'reject') {
      // ========== 拒绝调货 ==========
      // 只需要把 transfer_request 状态改为 rejected，同时把原借货单状态恢复为 pending
      const transaction = await db.startTransaction();
      try {
        // 恢复原借货单状态
        for (const item of goodsList) {
          if (item.originalBorrowId) {
            await transaction.collection('borrow').doc(item.originalBorrowId).update({
              data: { status: 'pending' }
            });
          }
        }

        // 更新调货请求状态
        await transaction.collection('transfer_requests').doc(transferRequestId).update({
          data: { status: 'rejected' }
        });

        await transaction.commit();
        return { success: true, message: '已拒绝调货' };

      } catch (txError) {
        await transaction.rollback();
        throw txError;
      }
    }

    // ========== 确认收货 ==========
    const transaction = await db.startTransaction();

    try {
      for (const item of goodsList) {
        const { originalBorrowId, goodsId, goodsName, originalQuantity, transferQty, unit, costPrice, salePrice } = item;
        const tQty = Number(transferQty) || Number(originalQuantity) || 0;
        const oQty = Number(originalQuantity) || tQty;

        // A. 处理发方原借货记录
        if (tQty >= oQty) {
          // 全部移走：标记原借货为 returned
          if (originalBorrowId) {
            await transaction.collection('borrow').doc(originalBorrowId).update({
              data: { status: 'returned', memo: `已移交给 ${user.name || user.username}` }
            });
          }
        } else {
          // 部分移走：扣减原借货数量，恢复为 pending
          if (originalBorrowId) {
            await transaction.collection('borrow').doc(originalBorrowId).update({
              data: { quantity: _.inc(-tQty), status: 'pending' }
            });
          }
        }

        // B. 为接方（当前用户）创建新的 pending 借货记录
        await transaction.collection('borrow').add({
          data: {
            type: 'transfer',    // 标记为调货产生
            borrowerId: userId,
            borrowerName: user.name || user.username,
            goodsId: goodsId,
            goodsName: goodsName,
            quantity: tQty,
            unit: unit || '',
            costPrice: costPrice || 0,
            salePrice: salePrice || 0,
            borrowDate: Date.now(),  // 统一时间戳
            locationId: transferReq.fromCustomerId || '',
            locationName: transferReq.fromCustomerName || '',
            status: 'pending',
            createTime: db.serverDate(),
            updateTime: db.serverDate(),
          }
        });

        // C. 扣减发方库存（带 stock >= qty 条件，防止并发负库存）
        const senderStockUpdate = await transaction.collection('user_goods').where({
          userId: transferReq.senderId,
          goodsId: goodsId,
          stock: _.gte(tQty)
        }).update({
          data: { stock: _.inc(-tQty) }
        });

        if (senderStockUpdate.stats.updated === 0) {
          throw new Error('发方库存不足：' + goodsName + ' 无法移走 ' + tQty);
        }

        // D. 增加接方库存
        const receiverStockRes = await transaction.collection('user_goods').where({
          userId: userId,
          goodsId: goodsId,
        }).get();

        if (receiverStockRes.data.length > 0) {
          await transaction.collection('user_goods').doc(receiverStockRes.data[0]._id).update({
            data: { stock: _.inc(tQty) }
          });
        } else {
          await transaction.collection('user_goods').add({
            data: {
              userId: userId,
              goodsName: goodsName,
              goodsId: goodsId,
              stock: tQty,
              unit: unit || '',
              createTime: db.serverDate(),
              updateTime: db.serverDate(),
            }
          });
        }
      }

      // E. 更新调货请求状态
      await transaction.collection('transfer_requests').doc(transferRequestId).update({
        data: { status: 'accepted' }
      });

      await transaction.commit();

      return {
        success: true,
        message: `收货成功，共 ${goodsList.length} 项商品`,
      };

    } catch (txError) {
      await transaction.rollback();
      throw txError;
    }

  } catch (err) {
    console.error('调货处理失败:', err);
    return {
      success: false,
      message: err.message || '服务器内部错误',
    };
  }
};

/**
 * 创建调货请求（替代前端直写，防止伪造）
 */
async function handleCreateTransfer(event) {
  var { userId, sessionToken, receiverId, groups } = event;
  try {
    var user = await checkAuth(userId, sessionToken);
    if (!receiverId || !Array.isArray(groups) || !groups.length) {
      return { success: false, message: '参数不完整' };
    }

    var transaction = await db.startTransaction();
    try {
      for (var i = 0; i < groups.length; i++) {
        var g = groups[i];

        // 服务端校验每条 borrow 归属和状态
        for (var j = 0; j < g.goodsList.length; j++) {
          var item = g.goodsList[j];
          var transferQty = parseFloat(item.transferQty);
          if (isNaN(transferQty) || transferQty <= 0) {
            throw new Error('调货数量无效');
          }

          var bRes = await transaction.collection('borrow').doc(item.originalBorrowId).get();
          var b = bRes.data;
          if (!b) throw new Error('借货记录不存在');
          if (b.borrowerId !== userId) throw new Error('无权操作他人借货');
          if (b.status !== 'pending') throw new Error('该记录状态不可调货');

          // ★ 校验调货数量 ≤ 借货数量
          var borrowQty = parseFloat(b.quantity);
          if (transferQty > borrowQty - 0.01) {
            throw new Error(
              '调货数量 ' + transferQty + ' 超过借货数量 ' + borrowQty +
              '（' + (b.goodsName || '') + '）'
            );
          }

          await transaction.collection('borrow').doc(item.originalBorrowId).update({
            data: { status: 'transferring' }
          });
        }

        await transaction.collection('transfer_requests').add({
          data: {
            senderId: userId,
            senderName: user.name || user.username || '',
            receiverId: receiverId,
            receiverName: event.receiverName || '',
            fromCustomerId: g.fromCustomerId,
            fromCustomerName: g.fromCustomerName,
            goodsList: g.goodsList,
            status: 'pending',
            createTime: db.serverDate(),
          }
        });
      }

      await transaction.commit();
      return { success: true, message: '移货请求已发送' };
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) {
    console.error('createTransfer 失败:', err);
    return { success: false, message: err.message || '发送失败' };
  }
}
