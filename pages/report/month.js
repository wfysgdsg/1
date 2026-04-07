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
      const res = await wx.cloud.callFunction({
        name: 'getReportData',
        data: {
          userInfo: userInfo,
          selectedMonth: this.data.selectedMonth
        }
      });

      wx.hideLoading();

      if (res.result && res.result.success) {
        const data = res.result.data;
        this.setData({
          totalSales: data.totalSales,
          totalCost: data.totalCost,
          profit: data.profit,
          topGoods: data.topGoods,
          topCustomers: data.topCustomers,
          lastMonthProfit: Number(data.lastMonthProfit),
          trend: data.trend,
          absTrend: data.absTrend,
        });
      } else {
        throw new Error((res.result && res.result.message) || '统计失败');
      }

    } catch (err) {
      console.error('报表生成失败', err);
      wx.hideLoading();
      wx.showToast({ title: '统计失败', icon: 'none' });
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
