/**
 * 月度报表逻辑 (反编译还原整理)
 * 整理日期：2024-03-26
 */
const db = wx.cloud.database();
const _ = db.command;
const { fetchAll } = require('../../utils/db');

Page({
  data: {
    selectedMonth: '',
    totalSales: '0.00',
    totalCost: '0.00',
    profit: '0.00',
    trend: 0,
    absTrend: 0,
    topGoods: [],
    topCustomers: [],
    lastMonthProfit: 0,
  },

  onLoad: function () {
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    this.setData({ selectedMonth: monthStr });
    this.loadReportData();
  },

  onMonthChange: function (e) {
    this.setData({ selectedMonth: e.detail.value });
    this.loadReportData();
  },

  /**
   * 加载并计算月度报表数据
   */
  async loadReportData() {
    wx.showLoading({ title: '生成报表中...' });
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo) return;

    try {
      // 1. 计算当前月的起止时间
      const [year, month] = this.data.selectedMonth.split('-').map(Number);
      const start = new Date(year, month - 1, 1).getTime();
      const end = new Date(year, month, 1).getTime();

      // 2. 获取本月所有销售记录 - 使用 fetchAll 获取完整数据，解决 20 条限制问题
      let whereCond = { saleTime: _.gte(start).and(_.lt(end)) };
      if (userInfo.role !== 'root') {
        whereCond.sellerId = userInfo._id;
      }

      const sales = await fetchAll(db.collection('sale').where(whereCond));

      let totalSalesAmt = 0;
      let totalCostAmt = 0;
      let totalProfitAmt = 0;
      const goodsMap = {};
      const customerMap = {};

      sales.forEach(sale => {
        // 计算销售总额 (注意：原逻辑按 goodsDetail 累加)
        if (Array.isArray(sale.goodsDetail)) {
          sale.goodsDetail.forEach(g => {
            const qty = parseFloat(g.quantity || 0);
            const price = parseFloat(g.salePrice || 0);
            const prof = parseFloat(g.profit || 0);

            totalSalesAmt += (qty * price);

            // 统计热销商品
            if (!goodsMap[g.goodsName]) {
              goodsMap[g.goodsName] = { name: g.goodsName, qty: 0, profit: 0 };
            }
            goodsMap[g.goodsName].qty += qty;
            goodsMap[g.goodsName].profit += prof;
          });
        }

        totalCostAmt += parseFloat(sale.totalCost || 0);
        totalProfitAmt += parseFloat(sale.totalProfit || 0);

        // 统计客户贡献
        const custName = sale.contactName || sale.locationName || '未知客户';
        if (!customerMap[custName]) {
          customerMap[custName] = { name: custName, profit: 0 };
        }
        customerMap[custName].profit += parseFloat(sale.totalProfit || 0);
      });

      // 排序前5名
      const topGoodsList = Object.values(goodsMap)
        .sort((a, b) => b.qty - a.qty || b.profit - a.profit)
        .slice(0, 5)
        .map(i => ({ ...i, qty: Number(i.qty.toFixed(2)), profit: Number(i.profit.toFixed(2)) }));

      const topCustomersList = Object.values(customerMap)
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 5)
        .map(i => ({ ...i, profit: Number(i.profit.toFixed(2)) }));

      // 3. 计算上月利润，用于对比趋势 - 使用 fetchAll 获取完整数据
      const lastMonthStart = new Date(year, month - 2, 1).getTime();
      const lastMonthEnd = start;
      let lastMonthWhere = { saleTime: _.gte(lastMonthStart).and(_.lt(lastMonthEnd)) };
      if (userInfo.role !== 'root') lastMonthWhere.sellerId = userInfo._id;

      const lastMonthSales = await fetchAll(db.collection('sale').where(lastMonthWhere));
      let lastProf = 0;
      (lastMonthSales || []).forEach(s => {
        lastProf += parseFloat(s.totalProfit || 0);
      });

      // 计算涨跌幅
      let trendRate = 0;
      if (lastProf > 0) {
        trendRate = ((totalProfitAmt - lastProf) / lastProf) * 100;
      }

      this.setData({
        totalSales: totalSalesAmt.toFixed(2),
        totalCost: totalCostAmt.toFixed(2),
        profit: totalProfitAmt.toFixed(2),
        topGoods: topGoodsList,
        topCustomers: topCustomersList,
        lastMonthProfit: Number(lastProf.toFixed(2)),
        trend: trendRate.toFixed(1),
        absTrend: Math.abs(trendRate).toFixed(1),
      });

    } catch (err) {
      console.error('报表生成失败', err);
      wx.showToast({ title: '统计失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 导出报表到 CSV 文件
   */
  async exportExcel() {
    const { selectedMonth, totalSales, totalCost, profit, topGoods, topCustomers } = this.data;

    // 生成 CSV 内容
    let csv = '\ufeff'; // UTF-8 BOM，防止 Excel 打开乱码
    csv += `月度利润报表 (${selectedMonth})\n\n`;
    csv += `核心指标\n`;
    csv += `销售总额,${totalSales}\n`;
    csv += `库存总成本,${totalCost}\n`;
    csv += `本月净利润,${profit}\n\n`;
    csv += `商品销量排行 (Top 5)\n`;
    csv += `排名,商品名称,销售数量,毛利贡献\n`;
    topGoods.forEach((g, idx) => {
      csv += `${idx + 1},${g.name},${g.qty},${g.profit}\n`;
    });
    csv += `\n客户贡献榜 (Top 5)\n`;
    csv += `排名,客户名称,毛利贡献\n`;
    topCustomers.forEach((c, idx) => {
      csv += `${idx + 1},${c.name},${c.profit}\n`;
    });

    wx.showLoading({ title: '正在生成导出文件...' });

    try {
      const fs = wx.getFileSystemManager();
      const filePath = `${wx.env.USER_DATA_PATH}/report_${Date.now()}.csv`;
      fs.writeFileSync(filePath, csv, 'utf8');

      const cloudPath = `reports/report_${selectedMonth}_${Date.now()}.csv`;
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath
      });

      const urlRes = await wx.cloud.getTempFileURL({ fileList: [uploadRes.fileID] });
      const downloadUrl = urlRes.fileList[0].tempFileURL;

      wx.hideLoading();
      wx.showModal({
        title: '导出成功',
        content: '报表已生成，请复制链接到浏览器下载。',
        confirmText: '复制链接',
        success: (res) => {
          if (res.confirm) {
            wx.setClipboardData({
              data: downloadUrl,
              success: () => wx.showToast({ title: '链接已复制' })
            });
          }
        }
      });
    } catch (err) {
      console.error('导出失败', err);
      wx.hideLoading();
      wx.showToast({ title: '导出失败', icon: 'none' });
    }
  },

  goBack: () => wx.navigateBack(),
});
