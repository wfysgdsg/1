/**
 * 销售报表页逻辑 (重构整理)
 * 整理日期：2025-01-26
 */
const db = wx.cloud.database();
const _ = db.command;
const { fetchAll } = require('../../utils/db');

Page({
  data: {
    filterMonth: '',
    totalAmount: 0,
    totalCost: 0,
    totalProfit: 0,
    goodsSummary: [],
    customerSummary: [],
    staffSummary: [],
    uiText: {
      thisMonth: '本月',
      summary: '销售汇总',
      totalAmount: '销售总额',
      totalCost: '总成本',
      totalProfit: '总毛利',
      byGoods: '按商品汇总',
      byCustomer: '按客户汇总',
      byStaff: '按人员汇总',
      goods: '商品',
      quantity: '数量',
      amount: '销售额',
      profit: '毛利',
      customer: '客户',
      count: '次数',
      staff: '人员',
    },
  },

  onShow: function () {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setFilterMonth();
      this.loadReport();
    } else {
      wx.redirectTo({ url: '/pages/login/login' });
    }
  },

  setFilterMonth: function () {
    const now = new Date();
    this.setData({
      filterMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    });
  },

  onMonthChange: function (e) {
    this.setData({ filterMonth: e.detail.value });
    this.loadReport();
  },

  /**
   * 加载报表数据
   */
  async loadReport() {
    wx.showLoading({ title: '加载中...' });
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo) return;

    try {
      const [year, month] = this.data.filterMonth.split('-').map(Number);
      const start = new Date(year, month - 1, 1).getTime();
      const end = new Date(year, month, 1).getTime();

      // 构建查询条件
      let whereCond = {
        saleTime: _.gte(start).and(_.lt(end)),
      };
      if (userInfo.role !== 'root') {
        whereCond.sellerId = userInfo._id;
      }

      // 使用 fetchAll 获取完整数据，解决 20 条限制问题
      const sales = await fetchAll(db.collection('sale').where(whereCond));

      // 获取用户列表（用于映射员工ID到名称）
      const usersRes = await db.collection('users').get();
      const userNameMap = {};
      (usersRes.data || []).forEach(u => {
        userNameMap[u._id] = u.name || u.username || '未知';
      });

      // 初始化统计变量
      let totalAmount = 0;
      let totalCost = 0;
      let totalProfit = 0;
      const goodsMap = {};
      const customerMap = {};
      const staffMap = {};

      // 遍历所有销售记录进行统计
      sales.forEach(sale => {
        totalAmount += Number(sale.totalAmount) || 0;
        totalCost += Number(sale.totalCost) || 0;
        totalProfit += Number(sale.totalProfit) || 0;

        // 按商品统计
        (sale.goodsDetail || []).forEach(g => {
          if (!goodsMap[g.goodsName]) {
            goodsMap[g.goodsName] = { name: g.goodsName, quantity: 0, amount: 0, profit: 0 };
          }
          const qty = Number(g.quantity) || 0;
          const price = Number(g.salePrice) || 0;
          goodsMap[g.goodsName].quantity += qty;
          goodsMap[g.goodsName].amount += qty * price;
          goodsMap[g.goodsName].profit += Number(g.profit) || 0;
        });

        // 按客户统计
        const custName = sale.contactName || sale.locationName || '未知';
        if (!customerMap[custName]) {
          customerMap[custName] = { name: custName, count: 0, amount: 0, profit: 0 };
        }
        customerMap[custName].count += 1;
        customerMap[custName].amount += Number(sale.totalAmount) || 0;
        customerMap[custName].profit += Number(sale.totalProfit) || 0;

        // 按人员统计
        const staffName = userNameMap[sale.sellerId] || '未知';
        if (!staffMap[staffName]) {
          staffMap[staffName] = { name: staffName, count: 0, amount: 0, profit: 0 };
        }
        staffMap[staffName].count += 1;
        staffMap[staffName].amount += Number(sale.totalAmount) || 0;
        staffMap[staffName].profit += Number(sale.totalProfit) || 0;
      });

      // 排序并取 Top 10
      const sortByAmount = (map) => Object.values(map)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10)
        .map(item => ({
          ...item,
          amount: Number(item.amount || 0).toFixed(2),
          profit: Number(item.profit || 0).toFixed(2),
        }));

      this.setData({
        totalAmount: totalAmount.toFixed(2),
        totalCost: totalCost.toFixed(2),
        totalProfit: totalProfit.toFixed(2),
        goodsSummary: sortByAmount(goodsMap),
        customerSummary: sortByAmount(customerMap),
        staffSummary: sortByAmount(staffMap),
      });

    } catch (err) {
      console.error('加载报表失败', err);
      wx.showToast({ title: '加载报表失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },
});
