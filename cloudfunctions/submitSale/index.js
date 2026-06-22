/**
 * 提交销售单云函数
 * 功能：处理销售单入库、扣减库存、更新借货状态
 * 修复：添加事务支持，确保数据一致性
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { TAX_RATES } = require('./constants');

const { checkAuth } = require('./auth');
const { BusinessError } = require('./errors');

exports.main = async (event, context) => {
  const { userId, sessionToken, selectedContact, selectedGoods, saleDate, payStatus, remark, importMode, importIds } = event;

  let transaction;

  try {
    // 1. 校验权限
    const user = await checkAuth(userId, sessionToken);

    // 2. 验证库存是否充足（仅导入模式检查，直接销售由自动借货提供库存）
    if (importMode) {
      const goodsIds = selectedGoods.map(g => g._id);
      const stockRes = await db.collection('user_goods').where({
        userId: userId,
        goodsId: _.in(goodsIds)
      }).get();

      const stockMap = {};
      (stockRes.data || []).forEach(item => {
        stockMap[item.goodsId] = item.stock || 0;
      });

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
    }

    // 3. 准备销售单数据（应用税率：硬件/1.13, 软件/1.06, 与前端 calcProfit 一致）
    let totalAmount = 0;
    let totalCost = 0;
    let totalProfit = 0;
    let totalInvoiceAmount = 0;

    const goodsDetail = selectedGoods.map(g => {
      const qty = parseFloat(g.quantity);
      const costPrice = Number(g.costPrice || 0);
      const salePrice = Number(g.salePrice || 0);
      const category = g.category || 'hardware';
      const taxRate = category === 'software' ? TAX_RATES.SOFTWARE : TAX_RATES.HARDWARE;

      const lineSale = (qty * salePrice) / taxRate;
      const lineCost = (qty * costPrice) / taxRate;
      const lineProfit = lineSale - lineCost;
      const lineInvoiceAmount = qty * salePrice;

      totalAmount += lineSale;
      totalCost += lineCost;
      totalProfit += lineProfit;
      totalInvoiceAmount += lineInvoiceAmount;

      return {
        goodsId: g._id,
        goodsName: g.name,
        category,
        unit: g.unit,
        quantity: qty,
        costPrice,
        salePrice,
        profit: lineProfit
      };
    });

    const saleRecord = {
      sellerId: userId,
      sellerName: user.name || user.username,
      contactId: selectedContact._id,
      contactName: selectedContact.name,
      locationId: selectedContact.locationId || '',
      locationName: selectedContact.locationName || '',
      goodsDetail,
      totalAmount,
      totalCost,
      totalProfit,
      totalInvoiceAmount,
      saleDate: new Date(saleDate).getTime() || Date.now(),
      saleTime: new Date(saleDate).getTime() || Date.now(),
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

      // B. 更新个人库存（仅导入模式扣库存，直接销售不碰库存）
      if (importMode) {
        for (const g of selectedGoods) {
          const qty = parseFloat(g.quantity);
          if (qty <= 0) continue;

          // ★ 关键：where 加 stock: _.gte(qty) 条件，防止并发超扣
          const updateRes = await transaction.collection('user_goods').where({
            userId: userId,
            goodsId: g._id,
            stock: _.gte(qty)
          }).update({
            data: {
              stock: _.inc(-qty),
              updateTime: db.serverDate()
            }
          });

          if (updateRes.stats.updated === 0) {
            // 要么记录不存在，要么 stock < qty（被并发请求抢先了）
            const cur = await transaction.collection('user_goods').where({
              userId, goodsId: g._id
            }).get();
            const curStock = (cur.data[0] && cur.data[0].stock) || 0;
            throw new Error(
              '库存不足：' + (g.name || g._id) +
              ' 当前库存 ' + curStock + '，需要 ' + qty
            );
          }
        }
      }

      // C. 处理借货记录
      if (importMode && importIds && importIds.length > 0) {
        // 导入模式：从 selectedGoods 构建 borrowId -> 销售数量 的映射
        const borrowQtyMap = {};
        for (const g of selectedGoods) {
          const bid = g.originalBorrowId;
          const qty = parseFloat(g.quantity);
          if (bid && qty > 0) {
            borrowQtyMap[bid] = (borrowQtyMap[bid] || 0) + qty;
          }
        }

        // 批量读取涉及的借货记录
        const borrowIds = Object.keys(borrowQtyMap);
        if (borrowIds.length > 0) {
          const borrowRes = await transaction.collection('borrow').where({
            _id: _.in(borrowIds)
          }).get();

          for (const record of (borrowRes.data || [])) {
            const soldQty = borrowQtyMap[record._id] || 0;
            const originalQty = Number(record.quantity) || 0;

            if (soldQty >= originalQty) {
              // 全部售出 → 标记为已售
              await transaction.collection('borrow').doc(record._id).update({
                data: {
                  status: 'sold',
                  saleId: saleId,
                  quantity: 0,
                  updateTime: db.serverDate()
                }
              });
            } else {
              // 部分售出 → 扣减数量，保持 pending，同时记录 saleId 供红冲追溯
              await transaction.collection('borrow').doc(record._id).update({
                data: {
                  quantity: _.inc(-soldQty),
                  saleId: saleId,
                  updateTime: db.serverDate()
                }
              });
            }
          }
        }
      } else if (!importMode) {
        // 直接销售模式：仅生成借货记录（不操作库存），确保每笔销售都有借货轨迹
        for (const g of selectedGoods) {
          const qty = parseFloat(g.quantity);
          if (qty <= 0) continue;

          await transaction.collection('borrow').add({
            data: {
              type: 'sale_trace',     // 标记为销售轨迹，区分真实借货
              borrowerId: userId,
              goodsId: g._id,
              goodsName: g.name,
              quantity: qty,
              unit: g.unit || '',
              contactId: selectedContact._id,
              contactName: selectedContact.name,
              locationId: selectedContact.locationId || selectedContact._id,
              locationName: selectedContact.locationName || selectedContact.name,
              status: 'sold',
              saleId: saleId,
              borrowDate: new Date(saleDate).getTime() || Date.now(),
              createTime: db.serverDate(),
              updateTime: db.serverDate()
            }
          });
        }
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
    // ★ M7: 区分业务错误和系统错误
    if (err instanceof BusinessError) {
      return { success: false, message: err.message };
    }
    return { success: false, message: '服务器错误，请稍后重试' };
  }
};
