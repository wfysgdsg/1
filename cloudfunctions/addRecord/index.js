/**
 * 新增记录云函数（带认证）
 * 功能：文本命令方式添加借货/销售记录
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const { checkAuth } = require('./auth');
const { escapeRegExp } = require('./util');

exports.main = async (event, context) => {
  const { userId, sessionToken, type, goodsName, quantity, customerName, salePrice, costPrice, date } = event;

  try {
    const userInfo = await checkAuth(userId, sessionToken);

    var goodsRes = await db.collection('goods')
      .where({ name: db.RegExp({ regexp: escapeRegExp(goodsName), options: 'i' }) })
      .get();

    if (!goodsRes.data || goodsRes.data.length === 0) {
      return { success: false, message: '未找到商品: ' + goodsName };
    }

    var goods = goodsRes.data[0];
    var recordDate = date ? new Date(date).getTime() : Date.now();

    if (type === 'borrow') {
      var qty = parseFloat(quantity);
      if (isNaN(qty) || qty <= 0) {
        return { success: false, message: '数量无效' };
      }

      var transaction = await db.startTransaction();
      try {
        await transaction.collection('borrow').add({
          data: {
            goodsId: goods._id,
            goodsName: goods.name,
            unit: goods.unit || '',
            costPrice: goods.costPrice,
            quantity: qty,
            borrowDate: recordDate,
            remark: '',
            status: 'pending',
            borrowerId: userId,
            borrowerName: userInfo.name || userInfo.username,
            createTime: db.serverDate()
          }
        });

        var stockRes = await transaction.collection('user_goods').where({
          userId: userId,
          goodsId: goods._id
        }).get();

        if (stockRes.data.length > 0) {
          await transaction.collection('user_goods').doc(stockRes.data[0]._id).update({
            data: { stock: db.command.inc(qty), updateTime: db.serverDate() }
          });
        } else {
          await transaction.collection('user_goods').add({
            data: {
              userId: userId,
              userName: userInfo.name || userInfo.username,
              goodsId: goods._id,
              goodsName: goods.name,
              stock: qty,
              unit: goods.unit || '',
              updateTime: db.serverDate()
            }
          });
        }

        await transaction.commit();
      } catch (txErr) {
        await transaction.rollback();
        throw txErr;
      }

      return {
        success: true,
        message: '借货记录已添加：' + goods.name + ' x ' + quantity + (goods.unit || '')
      };
    }

    if (type === 'sale') {
      if (!customerName) {
        return { success: false, message: '销售记录需要提供送货单位' };
      }

      var customerRes = await db.collection('customer')
        .where({ name: db.RegExp({ regexp: escapeRegExp(customerName), options: 'i' }) })
        .get();

      var customerId = '';
      var customerFinalName = customerName;
      if (customerRes.data && customerRes.data.length > 0) {
        customerId = customerRes.data[0]._id;
        customerFinalName = customerRes.data[0].name;
      }

      var finalSalePrice = salePrice ? parseFloat(salePrice) : goods.salePrice;
      var finalCostPrice = costPrice ? parseFloat(costPrice) : goods.costPrice;
      var qty = parseFloat(quantity);
      if (isNaN(qty) || qty <= 0) {
        return { success: false, message: '数量无效' };
      }
      var profit = (finalSalePrice - finalCostPrice) * qty;

      var transaction = await db.startTransaction();
      try {
        await transaction.collection('sale').add({
          data: {
            goodsDetail: [{
              goodsId: goods._id,
              goodsName: goods.name,
              unit: goods.unit || '',
              quantity: qty,
              salePrice: finalSalePrice,
              costPrice: finalCostPrice,
              profit: profit
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
            createTime: db.serverDate()
          }
        });

        // 校验并扣减库存
        var stockRes = await transaction.collection('user_goods').where({
          userId: userId,
          goodsId: goods._id
        }).get();

        if (stockRes.data.length === 0 || (stockRes.data[0].stock || 0) < qty) {
          await transaction.rollback();
          return { success: false, message: '库存不足：' + goods.name + ' 当前库存 ' + (stockRes.data[0] ? stockRes.data[0].stock : 0) + '，需要 ' + qty };
        }

        await transaction.collection('user_goods').doc(stockRes.data[0]._id).update({
          data: { stock: db.command.inc(-qty), updateTime: db.serverDate() }
        });

        await transaction.commit();
      } catch (txErr) {
        await transaction.rollback();
        throw txErr;
      }

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
