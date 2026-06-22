/**
 * 首页逻辑 (反编译还原整理)
 * 整理日期：2024-03-26
 */
const db = wx.cloud.database();
const _ = db.command;
const { fetchAll } = require('../../utils/db');

Page({
  data: {
    _anim: true,
    goodsCount: 0,
    borrowCount: 0,
    saleCount: 0,
    unpaidCount: 0,
    transferCount: 0,
    todaySales: '0.00',
    stockTotal: 0,
    avatarUrl: '',
    userName: '',
    currentDate: '',
    receivableList: [],
    receivableExpandedId: '',
    overdueBorrows: [],
    overdueTipText: '',
    transferTipText: '',
    uiText: {
      greeting: '你好，',
      profileIcon: '我',
      todaySales: '今日销售额',
      stockTotal: '当前总库存',
      unpaidCount: '待结清单数',
      goodsCount: '商品种类',
      borrowCount: '待还借货',
      saleCount: '今日单数',
      quickActions: '快捷操作',
      quickTip: '高频功能一键直达',
      addSale: '销售开票',
      addSaleDesc: '搜索商品 / 快速录单',
      addBorrow: '我要借货',
      addBorrowDesc: '录入借货，增加个人库存',
      debtIcon: '收',
      debt: '应收账款',
      contactIcon: '客',
      contact: '联系人',
      reportIcon: '报',
      report: '月报表',
      transferIcon: '调',
      transfer: '调货处理',
      receivableTitle: '首页应收账款',
      viewAll: '查看全部',
      collapse: '收起',
      expand: '展开',
      goods: '商品',
      quantity: '数量',
      price: '单价',
      total: '总价',
      profit: '毛利',
      noReceivables: '当前没有未收款订单',
    },
  },

  onShow: function () {
    this.setData({ _anim: false });
    setTimeout(() => this.setData({ _anim: true }), 50);
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      const now = new Date();
      this.setData({
        userName: userInfo.nickname || userInfo.name || userInfo.username,
        currentDate: `${now.getMonth() + 1}月${now.getDate()}日`,
        avatarUrl: '',
      });
      this.loadAvatar(userInfo.avatarUrl);
      this.loadStats();
      this.loadReceivables();
      this.loadOverdueBorrows();
    } else {
      wx.redirectTo({ url: '/pages/login/login' });
    }
  },

  /**
   * 加载头像（cloud:// → 临时 URL）
   */
  loadAvatar: function (cloudFileId) {
    if (!cloudFileId || cloudFileId.indexOf('cloud://') !== 0) {
      if (cloudFileId) this.setData({ avatarUrl: cloudFileId });
      return;
    }
    const that = this;
    wx.cloud.getTempFileURL({
      fileList: [cloudFileId],
      success: function (res) {
        if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
          that.setData({ avatarUrl: res.fileList[0].tempFileURL });
        }
      }
    });
  },

  /**
   * 加载首页统计数据
   */
  async loadStats() {
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo) return;

    try {
      const res = await wx.cloud.callFunction({
        name: 'homeStats',
        data: {
          userId: wx.getStorageSync('userId'),
          sessionToken: wx.getStorageSync('sessionToken'),
        }
      });

      if (!res.result || !res.result.success) return;
      const d = res.result.data;
      const todaySalesTotal = parseFloat(d.todaySales) || 0;
      const stockTotalQty = d.stockTotal || 0;

      this.setData({
        goodsCount: d.goodsCount,
        borrowCount: d.borrowCount,
        saleCount: d.todayCount || 0,
        unpaidCount: d.unpaidCount,
        transferCount: d.transferCount,
        transferTipText: d.transferCount > 0 ? '您有 ' + d.transferCount + ' 条待处理的移货申请' : '',
        todaySales: d.todaySales,
        stockTotal: stockTotalQty,
      });

    } catch (err) {
      console.error('加载统计失败', err);
    }
  },

  /**
   * 加载应收账款（首页列表展示）
   */
  async loadReceivables() {
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo) return;

    try {
      // 使用封装的 fetchAll 获取数据（最多取 200 条作为首页展示）
      const sales = await fetchAll(function() {
        var q = db.collection('sale').where(_.and([
          { payStatus: 'unpaid' },
          _.or([
            { voidStatus: _.exists(false) },
            { voidStatus: 'normal' },
          ]),
        ]));
        if (userInfo.role !== 'root') {
          q = q.where({ sellerId: userInfo._id });
        }
        return q.orderBy('createTime', 'desc');
      }, { maxPages: 2 });
      
      const customerMap = {};

      sales.forEach(sale => {
        const custId = sale.contactId || sale.locationId || sale._id;
        const custName = sale.contactName || sale.locationName || '未填写客户';

        // 解析商品明细
        const goodsRows = Array.isArray(sale.goodsDetail) ? sale.goodsDetail.map(g => {
          const qty = Number(g.quantity || 0);
          const price = Number(g.salePrice || 0);
          return {
            goodsName: g.goodsName,
            quantity: qty,
            unit: g.unit || '',
            salePrice: price.toFixed(2),
            lineTotal: (qty * price).toFixed(2),
            profit: Number(g.profit || 0).toFixed(2),
          };
        }) : [];

        const orderTotal = goodsRows.reduce((sum, g) => sum + Number(g.lineTotal), 0);
        const orderProfit = goodsRows.reduce((sum, g) => sum + Number(g.profit), 0);
        const invoiceAmount = sale.totalInvoiceAmount || orderTotal;
        const totalPaid = Number(sale.totalPaid || 0);
        const remainingAmount = invoiceAmount - totalPaid;

        // 跳过已全部付清的订单
        if (remainingAmount <= 0.01) return;

        if (!customerMap[custId]) {
          customerMap[custId] = {
            customerId: custId,
            customerName: custName,
            totalAmount: 0,
            totalProfit: 0,
            orderCount: 0,
            orders: [],
          };
        }

        customerMap[custId].totalAmount += remainingAmount;
        customerMap[custId].totalProfit += orderProfit;
        customerMap[custId].orderCount += 1;
        customerMap[custId].orders.push({
          _id: sale._id,
          saleDate: sale.saleDate,
          goodsRows: goodsRows,
          totalAmount: remainingAmount.toFixed(2),
          totalProfit: orderProfit.toFixed(2),
          invoiceAmount: invoiceAmount.toFixed(2),
          totalPaid: totalPaid.toFixed(2),
          hasPartial: totalPaid > 0,
        });
      });

      // 转换为数组并按总金额排序
      const receivableList = Object.values(customerMap).map(item => {
        const result = {
          customerId: item.customerId,
          customerName: item.customerName,
          totalAmount: item.totalAmount.toFixed(2),
          totalProfit: item.totalProfit.toFixed(2),
          orderCount: item.orderCount,
          orders: item.orders
        };
        return result;
      }).sort((a, b) => Number(b.totalAmount) - Number(a.totalAmount));

      this.setData({ receivableList });

    } catch (err) {
      console.error('加载应收账款失败', err);
    }
  },

  /**
   * 加载超期借货（借出超过 30 天仍未归还）
   */
  async loadOverdueBorrows() {
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo) return;

    try {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

      let query = db.collection('borrow').where({
        status: 'pending',
        borrowDate: _.lt(thirtyDaysAgo),
      });

      if (userInfo.role !== 'root') {
        query = query.where({ borrowerId: userInfo._id });
      }

      const res = await fetchAll(() => query.orderBy('borrowDate', 'asc'));
      var overdueBorrows = res || [];
      var overdueTipText = overdueBorrows.length > 0 ? '有 ' + overdueBorrows.length + ' 笔借货超期（超30天未还）' : '';
      this.setData({ overdueBorrows: overdueBorrows, overdueTipText: overdueTipText });
    } catch (err) {
      console.error('加载超期借货失败', err);
    }
  },

  buildOverdueTip: function () {
    return this.data.overdueTipText;
  },

  toggleReceivable: function (e) {
    const id = e.currentTarget.dataset.id;
    this.setData({
      receivableExpandedId: this.data.receivableExpandedId === id ? '' : id,
    });
  },

  // 快捷操作跳转
  goToGoods: () => wx.switchTab({ url: '/pages/goods/list' }),
  goToBorrow: () => wx.switchTab({ url: '/pages/borrow/list' }),
  goToSale: () => wx.switchTab({ url: '/pages/sale/list' }),
  goToProfile: () => wx.switchTab({ url: '/pages/profile/profile' }),
  goToAddBorrow: () => wx.navigateTo({ url: '/pages/borrow/add' }),
  goToAddSale: () => wx.navigateTo({ url: '/pages/sale/add' }),
  goToDebt: () => wx.navigateTo({ url: '/pages/sale/debt' }),
  goToContact: () => wx.navigateTo({ url: '/pages/contact/list' }),
  goToReport: () => wx.navigateTo({ url: '/pages/report/index' }),
  goToTransfer: () => wx.navigateTo({ url: '/pages/borrow/transfer-list' }),

  buildTransferTip: function () {
    return '您有 ' + this.data.transferCount + ' 条待处理的移货申请';
  },

  buildOrderMeta: function (orderCount) {
    return orderCount + ' 笔未结订单';
  },

  buildOrderTotal: function (order) {
    if (order.hasPartial) {
      return '待付 ¥' + order.totalAmount + '（已付 ¥' + order.totalPaid + '）';
    }
    return '待付 ¥' + order.totalAmount;
  },
});
