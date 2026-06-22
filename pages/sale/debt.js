/**
 * 应收账款页面（债务管理）
 */
var db = wx.cloud.database();
var _ = db.command;
var fetchAll = require('../../utils/db').fetchAll;

function formatDate(time) {
  if (!time) return '';
  var date = new Date(time);
  if (isNaN(date.getTime())) return '';
  var y = date.getFullYear();
  var m = String(date.getMonth() + 1).padStart(2, '0');
  var d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

function buildGoodsRows(goodsDetail) {
  if (!Array.isArray(goodsDetail)) return [];
  return goodsDetail.map(function(g) {
    var qty = Number(g.quantity || 0);
    var price = Number(g.salePrice || 0);
    return {
      goodsName: g.goodsName || '未命名商品',
      quantity: Number.isInteger(qty) ? qty : qty.toFixed(2),
      unit: g.unit || '',
      salePrice: price.toFixed(2),
      lineTotal: (qty * price).toFixed(2),
      profit: Number(g.profit || 0).toFixed(2),
    };
  });
}

function groupByCustomer(sales, computeAmount) {
  var customerMap = {};
  var totalAmount = 0;

  sales.forEach(function(sale) {
    var custId = sale.contactId || sale.locationId || sale._id;
    var custName = sale.contactName || sale.locationName || '未填写客户';
    var goodsRows = buildGoodsRows(sale.goodsDetail);
    var result = computeAmount(sale, goodsRows);

    if (result.skip) return;

    if (!customerMap[custId]) {
      customerMap[custId] = {
        contactId: custId,
        contactName: custName,
        totalOriginal: 0,
        totalProfit: 0,
        orders: [],
      };
    }

    customerMap[custId].totalOriginal += result.amount;
    customerMap[custId].totalProfit += result.profit;
    totalAmount += result.amount;

    customerMap[custId].orders.push({
      _id: sale._id,
      saleDate: sale.saleDate || formatDate(sale.saleTime),
      goodsRows: goodsRows,
      orderOriginal: result.displayAmount,
      orderProfit: result.profit.toFixed(2),
      debtDays: sale.debtDays || 0,
      payTimeStr: sale.payTimeStr || '',
      totalPaid: result.totalPaid || 0,
      totalPaidStr: (result.totalPaid || 0).toFixed(2),
      hasPartial: result.hasPartial || false,
      remaining: result.remaining || result.displayAmount,
      payStatus: sale.payStatus,
    });
  });

  var list = Object.values(customerMap).map(function(item) {
    item.displayOriginal = item.totalOriginal.toFixed(2);
    item.displayProfit = item.totalProfit.toFixed(2);
    return item;
  }).sort(function(a, b) {
    return b.totalOriginal - a.totalOriginal;
  });

  return { list: list, totalAmount: totalAmount, orderCount: sales.length, customerCount: list.length };
}

Page({
  data: {
    _anim: true,
    tab: 'unpaid',
    debtList: [],
    totalDebt: '0.00',
    debtCount: 0,
    customerCount: 0,
    expandedId: '',
    paidList: [],
    totalPaid: '0.00',
    paidCount: 0,
    paidCustomerCount: 0,
    paidExpandedId: '',
    showPayModal: false,
    payingSaleId: '',
    payingRemaining: '0',
    payingAmount: '',
    uiText: {
      unpaidTab: '应收账款',
      paidTab: '已收款项',
      totalDebt: '待回收总额',
      totalPaid: '已收总额',
      unpaidOrders: '笔未结订单',
      paidOrders: '笔已结订单',
      customers: '个欠款单位',
      paidCustomers: '个收款单位',
      orderCount: '笔单子',
      profit: '利',
      overdue: '已欠款',
      payTime: '收款时间',
      days: '天',
      originalPrice: '原价',
      grossProfit: '毛利',
      goodsName: '商品名称',
      quantity: '数量',
      unitPrice: '单价',
      totalPrice: '总价',
      confirmPayment: '确认收款',
      payRemaining: '收余款',
      noDebt: '目前没有欠款，账目全清。',
      noPaid: '暂无已收款项记录。',
    },
  },

  onShow: function() {this.loadDebts();
    this.loadPaid();
  },

  switchTab: function(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  loadDebts: function() {
    var that = this;
    var userInfo = wx.getStorageSync('userInfo');

    wx.showLoading({ title: '统计中...' });

    var q = db.collection('sale').where(_.and([
      { payStatus: 'unpaid' },
      _.or([{ voidStatus: _.exists(false) }, { voidStatus: 'normal' }]),
    ]));
    if (userInfo && userInfo.role !== 'root') {
      q = q.where({ sellerId: userInfo._id });
    }

    fetchAll(function() { return q.orderBy('saleTime', 'desc'); }).then(function(sales) {
      // 计算欠款天数
      var now = new Date();
      sales.forEach(function(s) {
        var saleDate = new Date(s.saleDate || s.saleTime);
        s.debtDays = Math.ceil(Math.abs(now - saleDate) / 86400000);
      });

      var result = groupByCustomer(sales, function(sale, goodsRows) {
        var orderTotal = goodsRows.reduce(function(sum, g) { return sum + Number(g.lineTotal); }, 0);
        var invoiceAmount = sale.totalInvoiceAmount || orderTotal;
        var totalPaid = Number(sale.totalPaid || 0);
        var remaining = invoiceAmount - totalPaid;
        if (remaining <= 0.01) return { skip: true };
        return {
          amount: remaining,
          profit: Number(sale.totalProfit || 0),
          displayAmount: remaining.toFixed(2),
          totalPaid: totalPaid,
          hasPartial: totalPaid > 0,
          remaining: remaining.toFixed(2),
        };
      });

      that.setData({
        debtList: result.list,
        totalDebt: result.totalAmount.toFixed(2),
        debtCount: result.orderCount,
        customerCount: result.customerCount,
      });
      wx.hideLoading();
    }).catch(function(err) {
      wx.hideLoading();
      console.error('加载债务失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  loadPaid: function() {
    var that = this;
    var userInfo = wx.getStorageSync('userInfo');

    var q = db.collection('sale').where(_.and([
      { payStatus: 'paid' },
      _.or([{ voidStatus: _.exists(false) }, { voidStatus: 'normal' }]),
    ]));
    if (userInfo && userInfo.role !== 'root') {
      q = q.where({ sellerId: userInfo._id });
    }

    fetchAll(function() { return q.orderBy('payTime', 'desc').limit(200); }).then(function(sales) {
      sales.forEach(function(s) {
        s.payTimeStr = formatDate(s.payTime);
      });

      var result = groupByCustomer(sales, function(sale, goodsRows) {
        var orderTotal = goodsRows.reduce(function(sum, g) { return sum + Number(g.lineTotal); }, 0);
        var invoiceAmount = sale.totalInvoiceAmount || orderTotal;
        var totalPaid = Number(sale.totalPaid || 0);
        return {
          amount: totalPaid || invoiceAmount,
          profit: Number(sale.totalProfit || 0),
          displayAmount: (totalPaid || invoiceAmount).toFixed(2),
          totalPaid: totalPaid,
          hasPartial: false,
          remaining: '0',
        };
      });

      that.setData({
        paidList: result.list,
        totalPaid: result.totalAmount.toFixed(2),
        paidCount: result.orderCount,
        paidCustomerCount: result.customerCount,
      });
    }).catch(function(err) {
      console.error('加载已收款失败', err);
    });
  },

  toggleCustomer: function(e) {
    var id = e.currentTarget.dataset.id;
    this.setData({ expandedId: this.data.expandedId === id ? '' : id });
  },

  togglePaidCustomer: function(e) {
    var id = e.currentTarget.dataset.id;
    this.setData({ paidExpandedId: this.data.paidExpandedId === id ? '' : id });
  },

  confirmPayment: function(e) {
    var saleId = e.currentTarget.dataset.id;
    var remaining = e.currentTarget.dataset.remaining || '0';

    if (!saleId) {
      wx.showToast({ title: '错误：找不到ID', icon: 'none' });
      return;
    }

    this.setData({
      showPayModal: true,
      payingSaleId: saleId,
      payingRemaining: remaining,
      payingAmount: remaining,
    });
  },

  onPayAmountInput: function(e) {
    this.setData({ payingAmount: e.detail.value });
  },

  cancelPayment: function() {
    this.setData({ showPayModal: false, payingSaleId: '', payingRemaining: '0', payingAmount: '' });
  },

  submitPayment: function() {
    var that = this;
    var saleId = this.data.payingSaleId;
    var remaining = parseFloat(this.data.payingRemaining);
    var amount = parseFloat(this.data.payingAmount);
    var userInfo = wx.getStorageSync('userInfo');
    var sessionToken = wx.getStorageSync('sessionToken');

    if (isNaN(amount) || amount <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }
    if (amount > remaining + 0.01) {
      wx.showToast({ title: '收款金额不能超过剩余 ¥' + remaining.toFixed(2), icon: 'none' });
      return;
    }

    that.setData({ showPayModal: false });
    wx.showLoading({ title: '处理中...' });

    wx.cloud.callFunction({
      name: 'saleManage',
      data: {
        action: 'recordPayment',
        userId: userInfo ? userInfo._id : '',
        sessionToken: sessionToken,
        saleId: saleId,
        amount: amount,
      }
    }).then(function(res) {
      wx.hideLoading();
      if (res.result && res.result.success) {
        wx.showToast({ title: res.result.message || '收款成功', icon: 'success' });
        setTimeout(function() {
          that.loadDebts();
          that.loadPaid();
        }, 800);
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '操作失败', icon: 'none' });
      }
    }).catch(function(err) {
      wx.hideLoading();
      console.error('收款失败', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  },
});
