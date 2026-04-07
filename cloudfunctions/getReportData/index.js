const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

exports.main = async (event, context) => {
  const { userInfo, selectedMonth } = event;
  if (!userInfo || !selectedMonth) {
    return { success: false, message: '参数不完整' };
  }
  const { _id: userId, role } = userInfo;

  try {
    const [year, month] = selectedMonth.split('-').map(Number);
    const start = new Date(year, month - 1, 1).getTime();
    const end = new Date(year, month, 1).getTime();

    const lastMonthStart = new Date(year, month - 2, 1).getTime();
    const lastMonthEnd = start;

    let matchCond = { saleTime: _.gte(start).and(_.lt(end)) };
    if (role !== 'root') matchCond.sellerId = userId;

    let lastMonthMatchCond = { saleTime: _.gte(lastMonthStart).and(_.lt(lastMonthEnd)) };
    if (role !== 'root') lastMonthMatchCond.sellerId = userId;

    const [summaryRes, lastMonthRes, topGoodsRes, topCustomersRes] = await Promise.all([
      // 1. 本月摘要统计
      db.collection('sale').aggregate()
        .match(matchCond)
        .group({
          _id: null,
          totalSales: $.sum($.reduce({
            input: '$goodsDetail',
            initialValue: 0,
            in: $.add(['$$value', $.multiply(['$$this.quantity', '$$this.salePrice'])])
          })),
          totalCost: $.sum('$totalCost'),
          totalProfit: $.sum('$totalProfit')
        })
        .end(),
      
      // 2. 上月利润对比
      db.collection('sale').aggregate()
        .match(lastMonthMatchCond)
        .group({
          _id: null,
          totalProfit: $.sum('$totalProfit')
        })
        .end(),

      // 3. 商品销量排行 (Top 5)
      db.collection('sale').aggregate()
        .match(matchCond)
        .unwind('$goodsDetail')
        .group({
          _id: '$goodsDetail.goodsName',
          name: $.first('$goodsDetail.goodsName'),
          qty: $.sum('$goodsDetail.quantity'),
          profit: $.sum('$goodsDetail.profit')
        })
        .sort({ qty: -1, profit: -1 })
        .limit(5)
        .end(),

      // 4. 客户贡献排行 (Top 5)
      db.collection('sale').aggregate()
        .match(matchCond)
        .addFields({
          custName: $.ifNull(['$contactName', $.ifNull(['$locationName', '未知客户'])])
        })
        .group({
          _id: '$custName',
          name: $.first('$custName'),
          profit: $.sum('$totalProfit')
        })
        .sort({ profit: -1 })
        .limit(5)
        .end()
    ]);

    const summary = summaryRes.list[0] || { totalSales: 0, totalCost: 0, totalProfit: 0 };
    const lastMonth = lastMonthRes.list[0] || { totalProfit: 0 };
    
    const totalProfitAmt = summary.totalProfit;
    const lastProf = lastMonth.totalProfit;
    
    let trendRate = 0;
    if (lastProf > 0) {
      trendRate = ((totalProfitAmt - lastProf) / lastProf) * 100;
    }

    return {
      success: true,
      data: {
        totalSales: Number(summary.totalSales).toFixed(2),
        totalCost: Number(summary.totalCost).toFixed(2),
        profit: Number(totalProfitAmt).toFixed(2),
        lastMonthProfit: Number(lastProf).toFixed(2),
        trend: trendRate.toFixed(1),
        absTrend: Math.abs(trendRate).toFixed(1),
        topGoods: topGoodsRes.list.map(i => ({
          ...i,
          qty: Number(i.qty.toFixed(2)),
          profit: Number(i.profit.toFixed(2))
        })),
        topCustomers: topCustomersRes.list.map(i => ({
          ...i,
          profit: Number(i.profit.toFixed(2))
        }))
      }
    };

  } catch (err) {
    console.error(err);
    return { success: false, message: '统计生成失败', error: err.message };
  }
};
