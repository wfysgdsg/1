/**
 * 首页统计云函数
 * 合并前端 6 次独立查库为 1 次调用
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { checkAuth } = require('./auth');

exports.main = async (event, context) => {
  const { userId, sessionToken } = event;
  try {
    const user = await checkAuth(userId, sessionToken);
    const isRoot = user.role === 'root';

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const notVoided = _.or([{ voidStatus: _.exists(false) }, { voidStatus: 'normal' }]);

    // 权限过滤
    var saleBaseFilter = isRoot ? { _: notVoided } : { sellerId: userId, _: notVoided };
    var borrowFilter = isRoot ? {} : { borrowerId: userId };
    var goodsFilter = isRoot ? {} : { userId: userId };

    // 并行查询
    var [goodsCount, borrowCount, todaySalesList, unpaidCount, stockList, transferCount] = await Promise.all([
      db.collection('goods').count().then(function(r){return r.total}),
      db.collection('borrow').where(Object.assign({ status: 'pending' }, borrowFilter)).count().then(function(r){return r.total}),
      fetchAll(function(){return db.collection('sale').where(Object.assign({ saleTime: _.gte(todayStart) }, saleBaseFilter)).field({ totalAmount: true, totalInvoiceAmount: true, totalCost: true, totalProfit: true })}),
      db.collection('sale').where(Object.assign({ payStatus: 'unpaid' }, saleBaseFilter)).count().then(function(r){return r.total}),
      db.collection('user_goods').where(goodsFilter).get().then(function(r){return r.data || []}),
      db.collection('transfer_requests').where({ receiverId: userId, status: 'pending' }).count().then(function(r){return r.total})
    ]);

    var todayAmount = todaySalesList.reduce(function(s,i){return s+(parseFloat(i.totalInvoiceAmount)||0)},0);
    var todayCount = todaySalesList.length;
    var stockTotal = stockList.reduce(function(s,i){return s+(parseFloat(i.stock)||0)},0);

    return {
      success: true,
      data: { goodsCount, borrowCount, todaySales: todayAmount.toFixed(2), todayCount, unpaidCount, stockTotal, transferCount }
    };
  } catch (err) {
    console.error('homeStats 错误:', err);
    return { success: false, message: err.message || '查询失败' };
  }
};

async function fetchAll(queryFactory) {
  var all=[],skip=0,limit=20;
  while(true){
    var res=await queryFactory().skip(skip).limit(limit).get();
    var d=res.data||[];
    all=all.concat(d);
    if(d.length<limit)break;
    skip+=d.length;
  }
  return all;
}
