/**
 * 销售报表（月度/年度双模式）
 * 权限：staff 只看自己，root 看全部且可按人员筛选
 */
const db = wx.cloud.database();
const _ = db.command;
const { fetchAll } = require('../../utils/db');

Page({
  data: {
    reportMode: 'month',
    selectedMonth: '',
    selectedYear: '',
    staffList: [],
    pickerStaffList: [],
    selectedStaffId: '',
    selectedStaffIndex: 0,
    isRoot: false,
    exporting: false,

    totalSales: '0.00',
    totalCost: '0.00',
    profit: '0.00',
    unpaidAmount: '0.00',
    trend: 0,
    absTrend: 0,
    trendLabel: '环比上月',
    compareProfit: 0,
    compareLabel: '上月',

    loaded: false,
    topGoods: [],
    topCustomers: [],
    maxCustomerProfit: 0,

    chartMonths: [],
    showChart: false,
  },

  onLoad: function () {
    const now = new Date();
    const userInfo = wx.getStorageSync('userInfo') || {};
    const isRoot = userInfo.role === 'root';

    this.setData({
      selectedMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      selectedYear: String(now.getFullYear()),
      isRoot: isRoot,
      pickerStaffList: [{ _id: '', name: '全部人员' }],
    });

    if (isRoot) this.loadStaffList();
    this.loadReport();
  },

  switchMode: function (e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.reportMode) return;
    this.setData({
      reportMode: mode,
      showChart: false,
      chartMonths: [],
    });
    this.loadReport();
  },

  onMonthChange: function (e) {
    this.setData({ selectedMonth: e.detail.value });
    this.loadReport();
  },

  onYearChange: function (e) {
    this.setData({ selectedYear: e.detail.value });
    this.loadReport();
  },

  onStaffChange: function (e) {
    const idx = parseInt(e.detail.value) || 0;
    const user = this.data.pickerStaffList[idx];
    this.setData({
      selectedStaffIndex: idx,
      selectedStaffId: user ? user._id : '',
    });
    this.loadReport();
  },

  async loadStaffList() {
    try {
      const res = await fetchAll(() =>
        db.collection('users').field({ _id: true, username: true, name: true })
      );
      const formatted = (res || []).map(u => ({
        _id: u._id,
        name: u.name || u.username || u._id,
      }));
      this.setData({
        staffList: res || [],
        pickerStaffList: [{ _id: '', name: '全部人员' }].concat(formatted),
      });
    } catch (err) {
      console.error('加载人员列表失败', err);
    }
  },

  getTargetUserId: function () {
    if (!this.data.isRoot) {
      const userInfo = wx.getStorageSync('userInfo') || {};
      return userInfo._id || '';
    }
    return this.data.selectedStaffId || null;
  },

  async loadReport() {
    wx.showLoading({ title: '生成报表中...' });
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo) { wx.hideLoading(); return; }

    try {
      if (this.data.reportMode === 'year') {
        await this.loadYearReport();
      } else {
        await this.loadMonthReport();
      }
    } catch (err) {
      console.error('报表生成失败', err);
      wx.showToast({ title: '统计失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  buildWhere: function (baseStart, baseEnd) {
    var conditions = [
      { saleTime: _.gte(baseStart).and(_.lt(baseEnd)) },
      _.or([{ voidStatus: _.exists(false) }, { voidStatus: 'normal' }]),
    ];
    var targetId = this.getTargetUserId();
    if (targetId) conditions.push({ sellerId: targetId });
    return _.and(conditions);
  },

  // ==================== 月度报表 ====================

  async loadMonthReport() {
    const [year, month] = this.data.selectedMonth.split('-').map(Number);
    const start = new Date(year, month - 1, 1).getTime();
    const end = new Date(year, month, 1).getTime();
    const lastStart = new Date(year, month - 2, 1).getTime();

    const [sales, lastSales] = await Promise.all([
      fetchAll(() => db.collection('sale').where(this.buildWhere(start, end))),
      fetchAll(() => db.collection('sale').where(this.buildWhere(lastStart, start))),
    ]);

    let lastProfit = 0;
    lastSales.forEach(s => { lastProfit += Number(s.totalProfit || 0); });

    const summary = this.aggregate(sales);
    let trend = 0;
    if (lastProfit > 0) trend = ((summary.totalProfit - lastProfit) / lastProfit) * 100;

    var monthData = Object.assign({}, summary, {
      loaded: true,
      trend: trend.toFixed(1),
      absTrend: Math.abs(trend).toFixed(1),
      trendLabel: '环比上月',
      compareProfit: Number(lastProfit.toFixed(2)),
      compareLabel: '上月',
      showChart: false,
      chartMonths: [],
    });
    this.setData(monthData);
  },

  // ==================== 年度报表 ====================

  async loadYearReport() {
    const year = parseInt(this.data.selectedYear);
    const start = new Date(year, 0, 1).getTime();
    const end = new Date(year + 1, 0, 1).getTime();
    const lastStart = new Date(year - 1, 0, 1).getTime();
    const lastEnd = start;

    const [sales, lastSales] = await Promise.all([
      fetchAll(() => db.collection('sale').where(this.buildWhere(start, end))),
      fetchAll(() => db.collection('sale').where(this.buildWhere(lastStart, lastEnd))),
    ]);

    let lastProfit = 0;
    lastSales.forEach(s => { lastProfit += Number(s.totalProfit || 0); });

    const summary = this.aggregate(sales);
    let trend = 0;
    if (lastProfit > 0) trend = ((summary.totalProfit - lastProfit) / lastProfit) * 100;

    // 按月份拆分利润，用于走势图
    const monthProfits = new Array(12).fill(0);
    sales.forEach(sale => {
      const m = new Date(sale.saleTime).getMonth();
      monthProfits[m] += Number(sale.totalProfit || 0);
    });

    var yearData = Object.assign({}, summary, {
      loaded: true,
      trend: trend.toFixed(1),
      absTrend: Math.abs(trend).toFixed(1),
      trendLabel: '同比去年',
      compareProfit: Number(lastProfit.toFixed(2)),
      compareLabel: '去年',
      chartMonths: monthProfits.map(function (v, i) {
        return { label: (i + 1) + '月', profit: v };
      }),
      showChart: true,
    });
    this.setData(yearData);

    // 延迟绘制图表，等 DOM 更新
    setTimeout(() => this.drawChart(), 300);
  },

  // ==================== 数据汇总 ====================

  aggregate(sales) {
    let totalSales = 0, totalCost = 0, totalProfit = 0, unpaidAmount = 0;
    const goodsMap = {};
    const customerMap = {};

    sales.forEach(sale => {
      totalSales += Number(sale.totalAmount || 0);
      totalCost += Number(sale.totalCost || 0);
      totalProfit += Number(sale.totalProfit || 0);
      if (sale.payStatus === 'unpaid') {
        unpaidAmount += Number(sale.totalAmount || 0);
      }

      (sale.goodsDetail || []).forEach(g => {
        const key = g.goodsName || '未知';
        if (!goodsMap[key]) goodsMap[key] = { name: key, qty: 0, amount: 0, profit: 0 };
        goodsMap[key].qty += Number(g.quantity || 0);
        goodsMap[key].amount += Number(g.quantity || 0) * Number(g.salePrice || 0);
        goodsMap[key].profit += Number(g.profit || 0);
      });

      const cust = sale.contactName || sale.locationName || '未知';
      if (!customerMap[cust]) customerMap[cust] = { name: cust, count: 0, amount: 0, profit: 0 };
      customerMap[cust].count += 1;
      customerMap[cust].amount += Number(sale.totalAmount || 0);
      customerMap[cust].profit += Number(sale.totalProfit || 0);
    });

    const makeTop = (map, sortKey) =>
      Object.values(map).sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0)).slice(0, 10).map(function (item) {
        return Object.assign({}, item, {
          amount: Number(item.amount || 0).toFixed(2),
          profit: Number(item.profit || 0).toFixed(2),
          qty: item.qty != null ? Number(item.qty.toFixed(2)) : undefined,
        });
      });

    const topGoods = makeTop(goodsMap, 'qty');
    const topCustomers = makeTop(customerMap, 'profit');
    const maxProfit = topCustomers.length > 0 ? parseFloat(topCustomers[0].profit) : 1;

    return {
      totalSales: totalSales.toFixed(2),
      totalCost: totalCost.toFixed(2),
      profit: totalProfit.toFixed(2),
      unpaidAmount: unpaidAmount.toFixed(2),
      topGoods,
      topCustomers: topCustomers.map(function (c) {
        return Object.assign({}, c, {
          percent: ((parseFloat(c.profit) / maxProfit) * 100).toFixed(0),
        });
      }),
      maxCustomerProfit: maxProfit,
    };
  },

  // ==================== 走势图 ====================

  drawChart() {
    const months = this.data.chartMonths;
    if (!months.length) return;

    const ctx = wx.createCanvasContext('trendChart', this);
    const sysInfo = wx.getSystemInfoSync();
    const dpr = sysInfo.pixelRatio || 2;
    const w = 690;  // 逻辑宽度
    const h = 400;

    const pad = { top: 30, right: 20, bottom: 50, left: 70 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;
    const barGap = 6;
    const barW = (chartW - barGap * 11) / 12;

    // 最大值
    const maxVal = Math.max(...months.map(m => m.profit), 1);
    const yMax = Math.ceil(maxVal * 1.15);

    ctx.clearRect(0, 0, w, h);

    // Y轴刻度线 + 标签
    const ySteps = 4;
    ctx.setFontSize(10);
    ctx.setFillStyle('#999');
    ctx.setTextAlign('right');
    ctx.setTextBaseline('middle');
    ctx.setStrokeStyle('#f0f0f0');
    ctx.setLineWidth(0.5);
    for (let i = 0; i <= ySteps; i++) {
      const y = pad.top + (chartH / ySteps) * i;
      const val = yMax - (yMax / ySteps) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.fillText(val.toFixed(0), pad.left - 8, y);
    }

    // 柱状图
    for (let i = 0; i < months.length; i++) {
      const x = pad.left + i * (barW + barGap) + barGap / 2;
      const barH = months[i].profit > 0 ? (months[i].profit / yMax) * chartH : 0;
      const y = pad.top + chartH - barH;
      const grad = ctx.createLinearGradient(x, y, x, pad.top + chartH);
      grad.addColorStop(0, '#36cfc9');
      grad.addColorStop(1, '#4F6EF7');
      ctx.setFillStyle(grad);
      ctx.fillRect(x, y, barW, Math.max(barH, 1));
    }

    // X轴标签
    ctx.setFillStyle('#999');
    ctx.setFontSize(9);
    ctx.setTextAlign('center');
    ctx.setTextBaseline('top');
    for (let i = 0; i < months.length; i++) {
      const x = pad.left + i * (barW + barGap) + barW / 2 + barGap / 2;
      ctx.fillText(`${i + 1}`, x, pad.top + chartH + 8);
    }

    ctx.draw();
  },

  // ==================== CSV 导出 ====================

  async exportCSV() {
    if (this.data.exporting) return;
    this.setData({ exporting: true });

    const { reportMode, selectedMonth, selectedYear, totalSales, totalCost, profit, unpaidAmount, trend, trendLabel, topGoods, topCustomers } = this.data;
    const title = reportMode === 'year' ? `${selectedYear} 年度销售报表` : `${selectedMonth} 月度销售报表`;
    const label = reportMode === 'year' ? selectedYear : selectedMonth;

    let csv = '﻿';
    csv += `${title}\n\n`;
    csv += '指标,金额\n';
    csv += `销售总额(不含税),${totalSales}\n`;
    csv += `总成本,${totalCost}\n`;
    csv += `净利润,${profit}\n`;
    csv += `应收账款,${unpaidAmount}\n`;
    csv += `${trendLabel},${trend}%\n\n`;

    csv += '商品销量排行\n';
    csv += '排名,商品,销量,销售额,毛利\n';
    topGoods.forEach((g, i) => {
      csv += `${i + 1},"${g.name}",${g.qty},${g.amount},${g.profit}\n`;
    });

    csv += '\n客户贡献排行\n';
    csv += '排名,客户,单数,销售额,毛利\n';
    topCustomers.forEach((c, i) => {
      csv += `${i + 1},"${c.name}",${c.count},${c.amount},${c.profit}\n`;
    });

    wx.showLoading({ title: '导出中...', mask: true });

    try {
      const fs = wx.getFileSystemManager();
      const filePath = `${wx.env.USER_DATA_PATH}/report_${label}.csv`;
      fs.writeFileSync(filePath, csv, 'utf8');

      wx.hideLoading();

      wx.openDocument({
        filePath: filePath,
        showMenu: true,
        fileType: 'csv',
        success: () => { this.setData({ exporting: false }); },
        fail: () => {
          wx.shareFileMessage({
            filePath: filePath,
            fileName: `report_${label}.csv`,
            success: () => { this.setData({ exporting: false }); },
            fail: () => {
              this.setData({ exporting: false });
              wx.showToast({ title: '导出失败', icon: 'none' });
            },
          });
        },
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ exporting: false });
      console.error('导出失败', err);
      wx.showToast({ title: '导出失败', icon: 'none' });
    }
  },
});
