/**
 * 销售列表逻辑
 */
var db = wx.cloud.database();
var _ = db.command;

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
  var payStatusStr = item.payStatus === 'paid' ? '已结清' : '未付款';
  
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
  
  return {
    _id: item._id,
    customerName: customerName,
    saleDateStr: saleDateStr,
    payStatus: item.payStatus,
    payStatusStr: payStatusStr,
    goodsDetail: goodsDetail,
    totalAmount: item.totalAmount,
    totalAmountStr: parseFloat(item.totalAmount || 0).toFixed(2),
    totalCost: item.totalCost,
    totalCostStr: parseFloat(item.totalCost || 0).toFixed(2),
    totalProfit: item.totalProfit,
    totalProfitStr: parseFloat(item.totalProfit || 0).toFixed(2),
    saleDate: formatDate(item.saleTime || item.createTime)
  };
}

Page({
  data: {
    saleList: [],
    filterMonth: '',
    totalAmount: 0,
    totalCost: 0,
    totalProfit: 0,
    filterOptions: [{ name: '全部', type: 'all', id: '' }],
    selectedFilter: null,
    sortOptions: [
      { name: '开票时间 新到旧', field: 'createTime', order: 'desc' },
      { name: '开票时间 旧到新', field: 'createTime', order: 'asc' },
      { name: '销售日期 新到旧', field: 'saleTime', order: 'desc' },
      { name: '销售日期 旧到新', field: 'saleTime', order: 'asc' },
      { name: '金额升序', field: 'totalAmount', order: 'asc' },
      { name: '金额降序', field: 'totalAmount', order: 'desc' },
      { name: '毛利升序', field: 'totalProfit', order: 'asc' },
      { name: '毛利降序', field: 'totalProfit', order: 'desc' }
    ],
    selectedSort: null,
    currentPage: 1,
    pageSize: 10,
    totalCount: 0,
    totalPages: 0,
    uiText: {
      all: '全部',
      sort: '排序',
      month: '本月',
      totalAmount: '销售总额',
      totalCost: '总成本',
      totalProfit: '总毛利',
      paid: '已结清',
      unpaid: '未付款',
      goods: '商品',
      quantity: '数量',
      unitPrice: '单价',
      profit: '毛利',
      total: '合计',
      confirmPayment: '确认收款',
      noSales: '暂无销售记录',
      addSale: '+ 销售开票'
    }
  },

  onShow: function() {
    var that = this;
    if (!this.data.filterMonth) {
      var now = new Date();
      var monthStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
      that.setData({
        filterMonth: monthStr,
        selectedSort: that.data.sortOptions[0],
        currentPage: 1
      });
    }
    that.loadFilterOptions();
    that.loadSale();
  },

  loadFilterOptions: function() {
    var that = this;
    db.collection('goods').orderBy('name', 'asc').limit(100).get().then(function(goodsRes) {
      return db.collection('contacts').orderBy('name', 'asc').limit(100).get().then(function(contactsRes) {
        return { goods: goodsRes, contacts: contactsRes };
      });
    }).then(function(result) {
      var options = [
        { name: '全部', type: 'all', id: '' },
        { name: '未付款', type: 'payStatus', id: 'unpaid' },
        { name: '已结清', type: 'payStatus', id: 'paid' }
      ];

      (result.goods.data || []).forEach(function(g) {
        options.push({ name: '商品:' + g.name, type: 'goods', id: g._id });
      });

      (result.contacts.data || []).forEach(function(c) {
        options.push({ name: '客户:' + c.name, type: 'customer', id: c._id });
      });

      that.setData({ filterOptions: options });
    }).catch(function(err) {
      console.error('加载筛选项失败', err);
    });
  },

  onMonthChange: function(e) {
    this.setData({ filterMonth: e.detail.value, currentPage: 1 });
    this.loadSale();
  },

  onFilterChange: function(e) {
    this.setData({ selectedFilter: this.data.filterOptions[e.detail.value], currentPage: 1 });
    this.loadSale();
  },

  onSortChange: function(e) {
    this.setData({ selectedSort: this.data.sortOptions[e.detail.value], currentPage: 1 });
    this.loadSale();
  },

  loadSale: function() {
    var that = this;
    wx.showLoading({ title: '加载中...' });

    var filterMonth = this.data.filterMonth;
    var currentPage = this.data.currentPage;
    var pageSize = this.data.pageSize;
    var selectedFilter = this.data.selectedFilter;
    var selectedSort = this.data.selectedSort || this.data.sortOptions[0];

    var parts = filterMonth.split('-');
    var year = parseInt(parts[0]);
    var month = parseInt(parts[1]);
    var start = new Date(year, month - 1, 1).getTime();
    var end = new Date(year, month, 1).getTime();

    var where = {
      saleTime: _.gte(start).and(_.lt(end))
    };

    var userInfo = wx.getStorageSync('userInfo');
    if (userInfo && userInfo.role !== 'root') {
      where.sellerId = userInfo._id;
    }

    if (selectedFilter) {
      if (selectedFilter.type === 'customer' && selectedFilter.id) {
        where.contactId = selectedFilter.id;
      } else if (selectedFilter.type === 'payStatus' && selectedFilter.id) {
        where.payStatus = selectedFilter.id;
      }
    }

    var sort = selectedSort;
    var collection = db.collection('sale').where(where);

    collection.count().then(function(countRes) {
      var total = countRes.total;
      var pages = Math.ceil(total / pageSize);
      var skip = (currentPage - 1) * pageSize;

      return collection.orderBy(sort.field, sort.order).skip(skip).limit(pageSize).get().then(function(res) {
        console.log('加载的销售数据:', res.data);
        return { total: total, pages: pages, data: res.data };
      });
    }).then(function(result) {
      var list = result.data.map(formatSaleItem);
      console.log('格式化后的数据:', list);
      
      // 计算整月合计
      var collection2 = db.collection('sale').where(where);
      return collection2.field({ totalAmount: true, totalCost: true, totalProfit: true }).limit(1000).get().then(function(totalRes) {
        var totalAmt = 0, totalCost = 0, totalProf = 0;
        totalRes.data.forEach(function(item) {
          totalAmt += (parseFloat(item.totalAmount) || 0);
          totalCost += (parseFloat(item.totalCost) || 0);
          totalProf += (parseFloat(item.totalProfit) || 0);
        });

        that.setData({
          saleList: list,
          totalAmount: totalAmt.toFixed(2),
          totalCost: totalCost.toFixed(2),
          totalProfit: totalProf.toFixed(2),
          totalCount: result.total,
          totalPages: result.pages
        });
        wx.hideLoading();
      });
    }).catch(function(err) {
      console.error('加载销售记录失败', err);
      wx.hideLoading();
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  prevPage: function() {
    if (this.data.currentPage > 1) {
      this.setData({ currentPage: this.data.currentPage - 1 });
      this.loadSale();
    }
  },

  nextPage: function() {
    if (this.data.currentPage < this.data.totalPages) {
      this.setData({ currentPage: this.data.currentPage + 1 });
      this.loadSale();
    }
  },

  goToAdd: function() {
    wx.navigateTo({ url: '/pages/sale/add' });
  },

  confirmPayment: function(e) {
    console.log('确认收款 clicked', e);
    var that = this;
    var saleId = e.currentTarget.dataset.id;
    var userInfo = wx.getStorageSync('userInfo');
    var sessionToken = wx.getStorageSync('sessionToken');
    
    if (!saleId) {
      wx.showToast({ title: '错误：找不到ID', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '确认收款',
      content: '确定这笔订单已经收到货款并标记为已结清吗？',
      success: function(modalRes) {
        if (!modalRes.confirm) return;

        wx.showLoading({ title: '处理中...' });

        wx.cloud.callFunction({
          name: 'saleManage',
          data: {
            action: 'confirmPayment',
            userId: userInfo ? userInfo._id : '',
            sessionToken: sessionToken,
            saleId: saleId
          }
        }).then(function(res) {
          console.log('云函数调用结果:', res);
          if (res.result && res.result.success) {
            wx.hideLoading();
            wx.showToast({ title: '处理成功', icon: 'success' });
            setTimeout(function() {
              that.loadSale();
            }, 800);
          } else {
            throw new Error(res.result ? res.result.message : '操作失败');
          }
        }).catch(function(err) {
          console.error('确认收款失败', err);
          wx.hideLoading();
          wx.showToast({ title: '操作失败: ' + err.message, icon: 'none' });
        });
      }
    });
  }
});