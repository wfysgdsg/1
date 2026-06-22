const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const { checkAuth } = require('./auth');
const { TAX_RATES } = require('./constants');
const { BusinessError } = require('./errors');

exports.main = async (event, context) => {
  const { action, userId, sessionToken, saleId } = event;
  
  try {
    const userInfo = await checkAuth(userId, sessionToken);
    
    // 确认收款（支持部分收款）
    if (action === 'confirmPayment' || action === 'recordPayment') {
      if (!saleId) return { success: false, message: '缺少订单信息' };

      const saleRes = await db.collection('sale').doc(saleId).get();
      const sale = saleRes.data;

      if (!sale) return { success: false, message: '订单不存在' };

      // 权限检查：root用户或该销售单的所属人
      if (userInfo.role !== 'root' && sale.sellerId !== userId) {
        return { success: false, message: '没有权限操作这笔订单' };
      }

      if (sale.payStatus === 'paid') {
        return { success: false, message: '该订单已结清' };
      }

      // 收款金额：新接口传 amount，旧接口默认全额收款
      const invoiceAmount = sale.totalInvoiceAmount || 0;
      const alreadyPaid = sale.totalPaid || 0;
      const remaining = invoiceAmount - alreadyPaid;
      const amount = event.amount ? Number(event.amount) : remaining;

      if (isNaN(amount) || amount <= 0) {
        return { success: false, message: '收款金额必须大于0' };
      }
      if (amount > remaining + 0.01) {
        return { success: false, message: `收款金额不能超过剩余 ¥${remaining.toFixed(2)}` };
      }

      const payment = {
        amount: amount,
        payTime: db.serverDate(),
        remark: event.remark || '',
      };

      // ★ 使用 _.inc 原子加法，避免并发覆盖
      await db.collection('sale').doc(saleId).update({
        data: {
          totalPaid: _.inc(amount),
          payments: _.push([payment]),
          updateTime: db.serverDate(),
        }
      });

      // 二次查询确认是否已结清
      const afterRes = await db.collection('sale').doc(saleId).get();
      const afterSale = afterRes.data;
      const newTotalPaid = afterSale.totalPaid || 0;
      const isFullyPaid = newTotalPaid >= invoiceAmount - 0.01;

      if (isFullyPaid) {
        await db.collection('sale').doc(saleId).update({
          data: {
            payStatus: 'paid',
            payTime: db.serverDate(),
          }
        });
      }

      const finalRemaining = invoiceAmount - newTotalPaid;
      const msg = isFullyPaid
        ? `收款 ¥${amount.toFixed(2)}，已全部结清`
        : `收款 ¥${amount.toFixed(2)}，剩余 ¥${finalRemaining.toFixed(2)}`;

      return { success: true, message: msg, totalPaid: newTotalPaid, remaining: finalRemaining, isFullyPaid };
    }

    // 红冲销售单
    if (action === 'voidSale') {
      const { voidReason } = event;
      if (!saleId) return { success: false, message: '缺少订单信息' };

      const saleRes = await db.collection('sale').doc(saleId).get();
      const sale = saleRes.data;

      if (!sale) return { success: false, message: '订单不存在' };
      if (sale.payStatus === 'paid') return { success: false, message: '已结清的订单不能红冲' };
      if (sale.voidStatus === 'voided') return { success: false, message: '该订单已被红冲，不能重复操作' };

      if (userInfo.role !== 'root' && sale.sellerId !== userId) {
        return { success: false, message: '没有权限操作这笔订单' };
      }

      const transaction = await db.startTransaction();

      try {
        // A. 标记红冲
        await transaction.collection('sale').doc(saleId).update({
          data: {
            voidStatus: 'voided',
            voidTime: db.serverDate(),
            voidReason: voidReason || '',
            updateTime: db.serverDate()
          }
        });

        // B. 恢复库存（仅导入模式恢复，直接销售未扣库存无需恢复）
        if (sale.importMode) {
          if (Array.isArray(sale.goodsDetail)) {
            for (const g of sale.goodsDetail) {
              const qty = parseFloat(g.quantity || 0);
              if (qty <= 0) continue;

              const stockRes = await transaction.collection('user_goods').where({
                userId: sale.sellerId,
                goodsId: g.goodsId
              }).get();

              if (stockRes.data.length > 0) {
                await transaction.collection('user_goods').doc(stockRes.data[0]._id).update({
                  data: {
                    stock: _.inc(qty),
                    updateTime: db.serverDate()
                  }
                });
              } else {
                await transaction.collection('user_goods').add({
                  data: {
                    userId: sale.sellerId,
                    goodsId: g.goodsId,
                    goodsName: g.goodsName,
                    stock: qty,
                    unit: g.unit || '',
                    updateTime: db.serverDate()
                  }
                });
              }
            }
          }
        }

        // C. 恢复/清理借货记录
        // 查找所有关联此 saleId 的借货记录（含全部售出 status=sold 和部分售出 status=pending）
        const borrowRes = await transaction.collection('borrow').where({
          saleId: saleId
        }).get();

        if (borrowRes.data.length > 0) {
          if (sale.importMode) {
            // 导入模式：逐一恢复借货记录
            for (const borrow of borrowRes.data) {
              if (borrow.status === 'sold') {
                // 全部售出 → 恢复为 pending，解除销售关联
                await transaction.collection('borrow').doc(borrow._id).update({
                  data: {
                    status: 'pending',
                    saleId: _.remove(),
                    updateTime: db.serverDate()
                  }
                });
              } else {
                // 部分售出 → 恢复扣减的数量，清除 saleId
                // 从销售单 goodsDetail 中找到对应商品的售出数量
                let restoredQty = 0;
                if (Array.isArray(sale.goodsDetail)) {
                  for (const g of sale.goodsDetail) {
                    if (g.goodsId === borrow.goodsId) {
                      restoredQty += parseFloat(g.quantity || 0);
                    }
                  }
                }
                if (restoredQty > 0) {
                  await transaction.collection('borrow').doc(borrow._id).update({
                    data: {
                      quantity: _.inc(restoredQty),
                      saleId: _.remove(),
                      updateTime: db.serverDate()
                    }
                  });
                }
              }
            }
          } else {
            // 直接销售模式：删除自动生成的借货记录
            const borrowIds = borrowRes.data.map(b => b._id);
            await transaction.collection('borrow').where({
              _id: _.in(borrowIds)
            }).remove();
          }
        }

        await transaction.commit();
        return { success: true, message: '红冲成功，库存和借货状态已恢复' };

      } catch (txErr) {
        await transaction.rollback();
        throw txErr;
      }
    }

    // 批量重算利润（根据商品当前成本价更新历史销售单）
    if (action === 'recalculateProfit') {
      if (userInfo.role !== 'root') {
        return { success: false, message: '仅管理员可执行此操作' };
      }

      const { filterMonth } = event;
      var whereConds = [
        _.or([{ voidStatus: _.exists(false) }, { voidStatus: 'normal' }]),
      ];

      if (filterMonth) {
        const parts = filterMonth.split('-');
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]);
        const start = new Date(year, month - 1, 1).getTime();
        const end = new Date(year, month, 1).getTime();
        whereConds.push({ saleTime: _.gte(start).and(_.lt(end)) });
      }

      // 先加载所有商品（costMap/categoryMap 局部变量，每次调用重建）
      const allGoods = await fetchAllGoods();
      var costMap = {};
      var categoryMap = {};
      allGoods.forEach(function(g) {
        costMap[g._id] = parseFloat(g.costPrice || 0);
        categoryMap[g._id] = g.category || 'hardware';
        if (g.name) {
          costMap['name:' + g.name] = parseFloat(g.costPrice || 0);
          categoryMap['name:' + g.name] = g.category || 'hardware';
        }
      });

      // 分批获取销售单（防止超时）
      const MAX_BATCH = 500;
      var sales = [];
      var page = 0;
      var pageSize = 50;
      var hasMore = true;
      while (hasMore && sales.length < MAX_BATCH) {
        var batch = await fetchSalesPage(whereConds, page * pageSize, pageSize);
        if (batch.length < pageSize) hasMore = false;
        sales = sales.concat(batch);
        page++;
      }
      if (sales.length >= MAX_BATCH) {
        return { success: false, message: '数据量过大（>' + MAX_BATCH + '条），请按月分批重算' };
      }

      // 分批更新（每组 20 条并发）
      var updatedCount = 0;
      var BATCH_SIZE = 20;
      for (var bi = 0; bi < sales.length; bi += BATCH_SIZE) {
        var batchSales = sales.slice(bi, bi + BATCH_SIZE);
        var tasks = [];

        for (var si = 0; si < batchSales.length; si++) {
          (function(sale) {
            tasks.push(processOneSale(sale));
          })(batchSales[si]);
        }

        var results = await Promise.all(tasks);
        results.forEach(function(r) { if (r) updatedCount++; });
      }
      return { success: true, message: '已更新 ' + updatedCount + ' 条记录', updatedCount: updatedCount };
    }

    return { success: false, message: '未知操作' };
  } catch (err) {
    console.error('云函数执行失败:', err);
    // ★ M7: 区分业务错误和系统错误
    if (err instanceof BusinessError) {
      return { success: false, message: err.message };
    }
    return { success: false, message: '服务器错误，请稍后重试' };
  }
};

// 获取所有商品
async function fetchAllGoods() {
  const pageSize = 100;
  var all = [];
  var skip = 0;
  while (true) {
    const res = await db.collection('goods').skip(skip).limit(pageSize).get();
    all = all.concat(res.data);
    if (res.data.length < pageSize) break;
    skip += pageSize;
  }
  return all;
}

// 获取所有符合条件的销售单
// costMap 和 categoryMap 从闭包引用

async function fetchSalesPage(whereConds, skip, limit) {
  var res = await db.collection('sale').where(_.and(whereConds)).skip(skip).limit(limit).get();
  return res.data || [];
}

async function processOneSale(sale) {
  if (!Array.isArray(sale.goodsDetail) || sale.goodsDetail.length === 0) return false;

  var newTotalCost = 0, newTotalProfit = 0, newTotalAmount = 0, newTotalInvoiceAmount = 0, changed = false;

  var newDetail = sale.goodsDetail.map(function(item) {
    var qty = parseFloat(item.quantity || 0), salePrice = parseFloat(item.salePrice || 0);
    var category = item.category;
    if (!category && item.goodsId && categoryMap[item.goodsId]) category = categoryMap[item.goodsId];
    if (!category && item.goodsName && categoryMap['name:' + item.goodsName]) category = categoryMap['name:' + item.goodsName];
    if (!category) category = 'hardware';
    if (!item.category && category) changed = true;
    var taxRate = category === 'software' ? TAX_RATES.SOFTWARE : TAX_RATES.HARDWARE;

    var lineInvoiceAmount = qty * salePrice;
    newTotalInvoiceAmount += lineInvoiceAmount;

    var currentCost = null;
    if (item.goodsId && costMap[item.goodsId] !== undefined) currentCost = costMap[item.goodsId];
    else if (item.goodsName && costMap['name:' + item.goodsName] !== undefined) currentCost = costMap['name:' + item.goodsName];

    if (currentCost !== null) {
      var lineSale = (qty * salePrice) / taxRate, lineCost = (qty * currentCost) / taxRate, lineProfit = lineSale - lineCost;
      if (Math.abs(lineProfit - parseFloat(item.profit || 0)) > 0.001) changed = true;
      newTotalAmount += lineSale; newTotalCost += lineCost; newTotalProfit += lineProfit;
      return { goodsId: item.goodsId || '', goodsName: item.goodsName || '', category: category, quantity: qty, unit: item.unit || '', salePrice: salePrice, costPrice: currentCost, profit: parseFloat(lineProfit.toFixed(2)) };
    } else {
      var oldCost = parseFloat(item.costPrice || 0), ls = (qty * salePrice) / taxRate, lc = (qty * oldCost) / taxRate;
      newTotalAmount += ls; newTotalCost += lc; newTotalProfit += parseFloat(item.profit || 0);
      item.category = category;
      return item;
    }
  });

  if (changed) {
    await db.collection('sale').doc(sale._id).update({
      data: { goodsDetail: newDetail, totalAmount: parseFloat(newTotalAmount.toFixed(2)), totalCost: parseFloat(newTotalCost.toFixed(2)), totalProfit: parseFloat(newTotalProfit.toFixed(2)), totalInvoiceAmount: parseFloat(newTotalInvoiceAmount.toFixed(2)), updateTime: db.serverDate() }
    });
    return true;
  }
  return false;
}

async function fetchAllSales(whereConds) {
  const pageSize = 100;
  var all = [];
  var skip = 0;
  while (true) {
    const res = await db.collection('sale').where(_.and(whereConds)).skip(skip).limit(pageSize).get();
    all = all.concat(res.data);
    if (res.data.length < pageSize) break;
    skip += pageSize;
  }
  return all;
}
