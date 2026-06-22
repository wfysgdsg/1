/**
 * 销售列表逻辑
 */
var db = wx.cloud.database();
var _ = db.command;
var { fetchAll, escapeRegExp } = require('../../utils/db');

function formatDate(time) {
  if (!time) return '';
  var date = new Date(time);
  if (isNaN(date.getTime())) return '';
  var y = date.getFullYear();
  var m = String(date.getMonth() + 1).padStart(2, '0');
  var d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

function formatSaleItem(item) {
  var customerName = item.contactName || item.locationName || '未填写客户';
  var saleDateStr = formatDate(item.saleTime || item.createTime);
  var totalPaid = parseFloat(item.totalPaid || 0);
  var hasPartial = totalPaid > 0 && item.payStatus !== 'paid';
  var payStatusStr;
  if (item.payStatus === 'paid') {
    payStatusStr = '已结清';
  } else if (hasPartial) {
    payStatusStr = '已付¥' + totalPaid.toFixed(0) + ' / 待付¥' + ((item.totalInvoiceAmount || 0) - totalPaid).toFixed(0);
  } else {
    payStatusStr = '未付款';
  }
  
  var goodsDetail = [];
  if (Array.isArray(item.goodsDetail)) {
    goodsDetail = item.goodsDetail.map(function(g) {
      return {
        goodsName: g.goodsName || g.name || '',
        quantity: g.quantity || 0,
        unit: g.unit || '',
        salePrice: parseFloat(g.salePrice || 0).toFixed(2),
        profit: parseFloat(g.profit || 0).toFixed(2)
      };
    });
  }
  
  var totalInvoiceAmount = item.totalInvoiceAmount;
  if (totalInvoiceAmount == null && Array.isArray(item.goodsDetail)) {
    totalInvoiceAmount = item.goodsDetail.reduce(function(sum, g) {
      return sum + (parseFloat(g.quantity) || 0) * (parseFloat(g.salePrice) || 0);
    }, 0);
  }

  var voidStatus = item.voidStatus || 'normal';
  var voidStatusStr = voidStatus === 'voided' ? '已红冲' : '';

  return {
    _id: item._id,
    customerName: customerName,
    saleDateStr: saleDateStr,
    payStatus: item.payStatus,
    payStatusStr: payStatusStr,
    voidStatus: voidStatus,
    voidStatusStr: voidStatusStr,
    goodsDetail: goodsDetail,
    totalAmount: item.totalAmount,
    totalAmountStr: parseFloat(item.totalAmount || 0).toFixed(2),
    totalCost: item.totalCost,
    totalCostStr: parseFloat(item.totalCost || 0).toFixed(2),
    totalProfit: item.totalProfit,
    totalProfitStr: parseFloat(item.totalProfit || 0).toFixed(2),
    totalInvoiceAmount: totalInvoiceAmount,
    totalInvoiceAmountStr: parseFloat(totalInvoiceAmount || 0).toFixed(2),
    totalPaid: totalPaid,
    totalPaidStr: totalPaid.toFixed(2),
    hasPartial: hasPartial,
    remaining: parseFloat((totalInvoiceAmount || 0) - totalPaid).toFixed(2),
    payments: item.payments || [],
    saleDate: formatDate(item.saleTime || item.createTime)
  };
}

Page({
  data: {
    _anim: true,
    saleList: [],
    filterMonth: '',
    totalAmount: 0,
    totalCost: 0,
    totalProfit: 0,
    totalInvoiceAmount: 0,
    statusFilter: 'unpaid',
    statusCache: {},   // 缓存各状态数据，切换秒开
    statusCounts: { unpaid: 0, paid: 0, voided: 0, all: 0 },
    searchKeyword: '',
    sortOptions: [
      { name: '时间 新→旧', field: 'saleTime', order: 'desc' },
      { name: '时间 旧→新', field: 'saleTime', order: 'asc' },
      { name: '金额 高→低', field: 'totalAmount', order: 'desc' },
      { name: '金额 低→高', field: 'totalAmount', order: 'asc' },
    ],
    selectedSort: null,
    currentPage: 1,
    pageSize: 10,
    totalCount: 0,
    totalPages: 0,
    showPayModal: false,
    payingSaleId: '',
    payingRemaining: '0',
    payingAmount: '',
    isRoot: false,
    recalculating: false,
    uiText: {
      all: '📋 全部',
      search: '搜客户名',
      sort: '排序',
      month: '本月',
      totalAmount: '销售总额',
      totalCost: '总成本',
      totalProfit: '总毛利',
      totalInvoiceAmount: '开票金额',
      paid: '✅ 已结清',
      unpaid: '⏳ 未付款',
      goods: '商品',
      quantity: '数量',
      unitPrice: '单价',
      profit: '毛利',
      total: '合计',
      confirmPayment: '确认收款',
      voidSale: '红冲',
      voided: '❌ 已红冲',
      noSales: '📊 暂无销售记录',
      addSale: '+ 销售开票'
    }
  },

  onShow: function() {
    this.setData({ _anim: false });
    setTimeout(() => this.setData({ _anim: true }), 50);
    var that = this;
    var userInfo = wx.getStorageSync('userInfo');
    if (!this.data.filterMonth) {
      var now = new Date();
      var monthStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
      that.setData({
        filterMonth: monthStr,
        selectedSort: that.data.sortOptions[0],
        currentPage: 1,
        isRoot: userInfo && userInfo.role === 'root'
      });
    } else {
      that.setData({ isRoot: userInfo && userInfo.role === 'root' });
    }

    // 缓存优先：先显示缓存数据，再后台静默刷新
    var cacheKey = 'sale_cache_' + (userInfo ? userInfo._id : 'anon') + '_' + this.data.filterMonth;
    var cached = wx.getStorageSync(cacheKey);
    if (cached && cached.list) {
      this.setData({
        saleList: cached.list,
        totalAmount: cached.totalAmount,
        totalCost: cached.totalCost,
        totalProfit: cached.totalProfit,
        totalInvoiceAmount: cached.totalInvoiceAmount,
        totalCount: cached.totalCount,
        totalPages: cached.totalPages,
        statusCounts: cached.statusCounts || this.data.statusCounts
      });
      that.loadSale(true); // 后台静默刷新
    } else {
      that.loadSale(false); // 首次加载
    }
  },

  onMonthChange: function(e) {
    this.setData({ filterMonth: e.detail.value, currentPage: 1, statusCache: {} });
    this.loadSale();
  },

  onStatusFilter: function(e) {
    var status = e.currentTarget.dataset.status;
    this.setData({ statusFilter: status, currentPage: 1 });

    // 有缓存先秒切，后台静默刷新（缓存键=状态+页码）
    var cacheKey = status + '_1';
    var cache = this.data.statusCache[cacheKey];
    if (cache) {
      this.setData({
        saleList: cache.saleList || [],
        totalCount: cache.totalCount || 0,
        totalPages: cache.totalPages || 0,
        totalAmount: cache.totalAmount || '0.00',
        totalCost: cache.totalCost || '0.00',
        totalProfit: cache.totalProfit || '0.00',
        totalInvoiceAmount: cache.totalInvoiceAmount || '0.00',
      });
      this.loadSale(true); // 后台静默刷新
    } else {
      this.loadSale();
    }
  },

  onSearchInput: function(e) {
    this.setData({ searchKeyword: e.detail.value, currentPage: 1 });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    var that = this;
    this._searchTimer = setTimeout(function() { that.loadSale(); }, 350);
  },

  onSortChange: function(e) {
    this.setData({ selectedSort: this.data.sortOptions[e.detail.value], currentPage: 1 });
    this.loadSale();
  },

  loadSale: function(silent) {
    var that = this;
    if (!silent) wx.showLoading({ title: '加载中...' });

    var filterMonth = this.data.filterMonth;
    var currentPage = this.data.currentPage;
    var pageSize = this.data.pageSize;
    var statusFilter = this.data.statusFilter;
    var searchKeyword = this.data.searchKeyword;
    var selectedSort = this.data.selectedSort || this.data.sortOptions[0];

    var parts = filterMonth.split('-');
    var year = parseInt(parts[0]);
    var month = parseInt(parts[1]);
    var start = new Date(year, month - 1, 1).getTime();
    var end = new Date(year, month, 1).getTime();

    var userInfo = wx.getStorageSync('userInfo');

    // 构建查询条件
    var whereConds = [
      { saleTime: _.gte(start).and(_.lt(end)) }
    ];

    // 快捷状态筛选
    if (statusFilter === 'unpaid') {
      whereConds.push({ payStatus: 'unpaid' });
      whereConds.push(_.or([{ voidStatus: _.exists(false) }, { voidStatus: 'normal' }]));
    } else if (statusFilter === 'paid') {
      whereConds.push({ payStatus: 'paid' });
      whereConds.push(_.or([{ voidStatus: _.exists(false) }, { voidStatus: 'normal' }]));
    } else if (statusFilter === 'voided') {
      whereConds.push({ voidStatus: 'voided' });
    }

    // 权限
    if (userInfo && userInfo.role !== 'root') {
      whereConds.push({ sellerId: userInfo._id });
    }

    // 搜索客户名
    if (searchKeyword) {
      whereConds.push(_.or([
        { contactName: db.RegExp({ regexp: escapeRegExp(searchKeyword), options: 'i' }) },
        { locationName: db.RegExp({ regexp: escapeRegExp(searchKeyword), options: 'i' }) }
      ]));
    }

    var where = _.and(whereConds);

    // 同时加载数量统计（不受搜索影响）
    var countConds = [
      { saleTime: _.gte(start).and(_.lt(end)) }
    ];
    if (userInfo && userInfo.role !== 'root') {
      countConds.push({ sellerId: userInfo._id });
    }

    Promise.all([
      db.collection('sale').where(_.and(countConds.concat([{ payStatus: 'unpaid' }, _.or([{ voidStatus: _.exists(false) }, { voidStatus: 'normal' }])]))).count(),
      db.collection('sale').where(_.and(countConds.concat([{ payStatus: 'paid' }, _.or([{ voidStatus: _.exists(false) }, { voidStatus: 'normal' }])]))).count(),
      db.collection('sale').where(_.and(countConds.concat([{ voidStatus: 'voided' }]))).count(),
    ]).then(function(counts) {
      that.setData({
        statusCounts: {
          unpaid: counts[0].total,
          paid: counts[1].total,
          voided: counts[2].total,
          all: counts[0].total + counts[1].total + counts[2].total
        }
      });
    }).catch(function(err) {
      console.error('加载状态计数失败', err);
    });

    // 主列表查询
    var sort = selectedSort;
    var collection = db.collection('sale').where(where);

    collection.count().then(function(countRes) {
      var total = countRes.total;
      var pages = Math.ceil(total / pageSize);
      var skip = (currentPage - 1) * pageSize;

      return collection.orderBy(sort.field, sort.order).skip(skip).limit(pageSize).get().then(function(res) {
        return { total: total, pages: pages, data: res.data };
      });
    }).then(function(result) {
      var list = result.data.map(formatSaleItem);

      // 计算汇总（排除已红冲单）
      var totalsConds = [
        { saleTime: _.gte(start).and(_.lt(end)) },
        _.or([{ voidStatus: _.exists(false) }, { voidStatus: 'normal' }]),
      ];
      if (userInfo && userInfo.role !== 'root') {
        totalsConds.push({ sellerId: userInfo._id });
      }
      if (statusFilter === 'unpaid') {
        totalsConds.push({ payStatus: 'unpaid' });
      } else if (statusFilter === 'paid') {
        totalsConds.push({ payStatus: 'paid' });
      }

      return fetchAll(function() {
        return db.collection('sale').where(_.and(totalsConds)).field({ totalAmount: true, totalCost: true, totalProfit: true, totalInvoiceAmount: true, goodsDetail: true });
      }).then(function(totalRes) {
        var totalAmt = 0, totalCost = 0, totalProf = 0, totalInvoiceAmt = 0;
        totalRes.forEach(function(item) {
          totalAmt += (parseFloat(item.totalAmount) || 0);
          totalCost += (parseFloat(item.totalCost) || 0);
          totalProf += (parseFloat(item.totalProfit) || 0);
          var invAmt = item.totalInvoiceAmount;
          if (invAmt == null && Array.isArray(item.goodsDetail)) {
            invAmt = item.goodsDetail.reduce(function(sum, g) {
              return sum + (parseFloat(g.quantity) || 0) * (parseFloat(g.salePrice) || 0);
            }, 0);
          }
          totalInvoiceAmt += (parseFloat(invAmt) || 0);
        });

        var saleData = {
          saleList: list,
          totalAmount: totalAmt.toFixed(2),
          totalCost: totalCost.toFixed(2),
          totalProfit: totalProf.toFixed(2),
          totalInvoiceAmount: totalInvoiceAmt.toFixed(2),
          totalCount: result.total,
          totalPages: result.pages
        };
        that.setData(saleData);

        // 写入状态缓存（状态+页码，切换秒开）
        var statusCache = that.data.statusCache;
        var cacheKey = statusFilter + '_' + currentPage;
        statusCache[cacheKey] = Object.assign({}, saleData);
        that.setData({ statusCache: statusCache });

        // 写入缓存
        var userInfo = wx.getStorageSync('userInfo');
        wx.setStorageSync('sale_cache_' + (userInfo ? userInfo._id : 'anon') + '_' + filterMonth, {
          list: list,
          totalAmount: totalAmt.toFixed(2),
          totalCost: totalCost.toFixed(2),
          totalProfit: totalProf.toFixed(2),
          totalInvoiceAmount: totalInvoiceAmt.toFixed(2),
          totalCount: result.total,
          totalPages: result.pages,
          statusCounts: that.data.statusCounts,
          time: Date.now()
        });

        if (!silent) wx.hideLoading();
      });
    }).catch(function(err) {
      console.error('加载销售记录失败', err);
      if (!silent) wx.hideLoading();
      wx.showToast({ title: '加载失败', icon: 'none' });
    });

    // 后台预加载其他三个状态（仅首次）
    if (!silent) {
      setTimeout(function() { that.preloadStatuses(start, end, userInfo, whereConds); }, 500);
    }
  },

  // 后台预加载全部状态数据，切换秒开
  preloadStatuses: function(start, end, userInfo, baseConds) {
    var that = this;
    var statuses = ['paid', 'voided', 'all'].filter(function(s) { return !that.data.statusCache[s]; });

    statuses.forEach(function(status) {
      var conds = baseConds.slice();
      if (status === 'paid') {
        conds.push({ payStatus: 'paid' });
        conds.push(_.or([{ voidStatus: _.exists(false) }, { voidStatus: 'normal' }]));
      } else if (status === 'voided') {
        conds.push({ voidStatus: 'voided' });
      }
      // 'all' 不加额外条件

      var where = _.and(conds);
      db.collection('sale').where(where).count().then(function(countRes) {
        var pageSize = 20;
        return db.collection('sale').where(where)
          .orderBy('saleTime', 'desc').limit(pageSize).get()
          .then(function(res) {
            var list = res.data.map(formatSaleItem);
            var cache = that.data.statusCache;
            cache[status + '_1'] = {
              saleList: list,
              totalCount: countRes.total,
              totalPages: Math.ceil(countRes.total / pageSize),
              totalAmount: '0.00', totalCost: '0.00',
              totalProfit: '0.00', totalInvoiceAmount: '0.00'
            };
            that.setData({ statusCache: cache });
          });
      }).catch(function() { /* 静默失败 */ });
    });
  },

  prevPage: function() {
    if (this.data.currentPage > 1) {
      var page = this.data.currentPage - 1;
      this.setData({ currentPage: page });
      this.loadPageWithCache(page);
    }
  },

  nextPage: function() {
    if (this.data.currentPage < this.data.totalPages) {
      var page = this.data.currentPage + 1;
      this.setData({ currentPage: page });
      this.loadPageWithCache(page);
    }
  },

  // 翻页时优先读缓存，无缓存再查库
  loadPageWithCache: function(page) {
    var cacheKey = this.data.statusFilter + '_' + page;
    var cache = this.data.statusCache[cacheKey];
    if (cache) {
      this.setData({
        saleList: cache.saleList || [],
        totalCount: cache.totalCount || 0,
        totalPages: cache.totalPages || 0,
        totalAmount: cache.totalAmount || '0.00',
        totalCost: cache.totalCost || '0.00',
        totalProfit: cache.totalProfit || '0.00',
        totalInvoiceAmount: cache.totalInvoiceAmount || '0.00',
      });
    } else {
      this.loadSale();
    }
  },

  voidSale: function(e) {
    var that = this;
    var saleId = e.currentTarget.dataset.id;
    var userInfo = wx.getStorageSync('userInfo');
    var sessionToken = wx.getStorageSync('sessionToken');

    if (!saleId) {
      wx.showToast({ title: '错误：找不到ID', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '红冲确认',
      content: '红冲后库存和借货状态将自动恢复，确定红冲这笔销售单吗？',
      success: function(modalRes) {
        if (!modalRes.confirm) return;

        wx.showLoading({ title: '红冲处理中...' });

        wx.cloud.callFunction({
          name: 'saleManage',
          data: {
            action: 'voidSale',
            userId: userInfo ? userInfo._id : '',
            sessionToken: sessionToken,
            saleId: saleId
          }
        }).then(function(res) {
          wx.hideLoading();
          if (res.result && res.result.success) {
            wx.showToast({ title: '红冲成功', icon: 'success' });
            setTimeout(function() { that.loadSale(); }, 800);
          } else {
            wx.showToast({ title: res.result.message || '红冲失败', icon: 'none' });
          }
        }).catch(function(err) {
          wx.hideLoading();
          console.error('红冲失败', err);
          wx.showToast({ title: '操作失败', icon: 'none' });
        });
      }
    });
  },

  goToAdd: function() {
    wx.navigateTo({ url: '/pages/sale/add' });
  },

  // 跳转送货单
  goToDelivery: function(e) {
    var saleId = e.currentTarget.dataset.id;
    if (!saleId) {
      wx.showToast({ title: '缺少销售单信息', icon: 'none' });
      return;
    }
    wx.redirectTo({ url: '/pages/sale/delivery?id=' + saleId });
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
      payingAmount: remaining
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
        amount: amount
      }
    }).then(function(res) {
      wx.hideLoading();
      if (res.result && res.result.success) {
        wx.showToast({ title: res.result.message || '收款成功', icon: 'success' });
        setTimeout(function() { that.loadSale(); }, 1000);
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '操作失败', icon: 'none' });
      }
    }).catch(function(err) {
      wx.hideLoading();
      console.error('收款失败', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  },

  recalculateProfit: function() {
    var that = this;
    wx.showModal({
      title: '重算利润',
      content: '将根据商品库当前成本价，重新计算「' + (this.data.filterMonth || '全部') + '」销售单的成本和利润。确定继续？',
      success: function(modalRes) {
        if (!modalRes.confirm) return;

        var userInfo = wx.getStorageSync('userInfo');
        var sessionToken = wx.getStorageSync('sessionToken');

        that.setData({ recalculating: true });
        wx.showLoading({ title: '重算中...' });

        wx.cloud.callFunction({
          name: 'saleManage',
          data: {
            action: 'recalculateProfit',
            userId: userInfo ? userInfo._id : '',
            sessionToken: sessionToken,
            filterMonth: that.data.filterMonth || null,
          }
        }).then(function(res) {
          wx.hideLoading();
          that.setData({ recalculating: false });
          if (res.result && res.result.success) {
            wx.showToast({ title: res.result.message, icon: 'success' });
            that.loadSale();
          } else {
            wx.showToast({ title: (res.result && res.result.message) || '操作失败', icon: 'none' });
          }
        }).catch(function(err) {
          wx.hideLoading();
          that.setData({ recalculating: false });
          console.error('重算利润失败', err);
          wx.showToast({ title: '操作失败', icon: 'none' });
        });
      }
    });
  }
});