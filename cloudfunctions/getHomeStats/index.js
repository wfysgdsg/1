const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

exports.main = async (event, context) => {
  const { userInfo } = event;
  if (!userInfo) {
    return { success: false, message: '未提供用户信息' };
  }
  const { _id: userId, role } = userInfo;

  const now = new Date();
  // 云函数时区通常为 UTC，这里简单处理今日 0 点时间戳
  // 生产环境应考虑准确的时区偏移
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  try {
    const results = await Promise.all([
      // 1. 商品总种类
      db.collection('goods').count(),
      
      // 2. 待还借货数
      (role === 'root' ? db.collection('borrow').where({ status: 'pending' }) : 
       db.collection('borrow').where({ status: 'pending', borrowerId: userId })).count(),
       
      // 3. 今日销售统计 (聚合)
      db.collection('sale').aggregate()
        .match(Object.assign({
          saleTime: _.gte(todayStart)
        }, role === 'root' ? {} : { sellerId: userId }))
        .group({
          _id: null,
          totalAmount: $.sum('$totalAmount'),
          count: $.sum(1)
        })
        .end(),
        
      // 4. 待结清单数
      db.collection('sale').where(Object.assign({
        payStatus: 'unpaid'
      }, role === 'root' ? {} : { sellerId: userId })).count(),
      
      // 5. 个人库存统计 (聚合)
      db.collection('user_goods').aggregate()
        .match(role === 'root' ? {} : { userId: userId })
        .group({
          _id: null,
          totalStock: $.sum('$stock')
        })
        .end(),
        
      // 6. 待处理调货
      db.collection('transfer_requests').where({
        receiverId: userId,
        status: 'pending'
      }).count()
    ]);

    const [
      goodsCountRes,
      borrowCountRes,
      saleStatsRes,
      unpaidCountRes,
      stockStatsRes,
      transferCountRes
    ] = results;

    const saleStats = saleStatsRes.list[0] || { totalAmount: 0, count: 0 };
    const stockStats = stockStatsRes.list[0] || { totalStock: 0 };

    return {
      success: true,
      data: {
        goodsCount: goodsCountRes.total,
        borrowCount: borrowCountRes.total,
        saleCount: saleStats.count,
        unpaidCount: unpaidCountRes.total,
        stockTotal: stockStats.totalStock,
        transferCount: transferCountRes.total,
        todaySales: Number(saleStats.totalAmount).toFixed(2)
      }
    };
  } catch (err) {
    console.error(err);
    return { success: false, message: '统计加载失败', error: err.message };
  }
};
