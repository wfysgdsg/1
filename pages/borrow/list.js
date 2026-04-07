/**
 * 借货列表页逻辑
 */
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    tab: 'detail',
    customerGroups: [],
    stockList: [],
    loading: false,
    currentPage: 1,
    pageSize: 10,
    totalCount: 0,
    totalPages: 0,
    stockPage: 1,
    stockTotalCount: 0,
    stockTotalPages: 0,
    uiText: {
      detailTab: '借货客户明细',
      stockTab: '个人库存',
      latestBorrow: '最近借货',
      viewAll: '查看该客户全部借货详情',
      manageHint: '点击进入管理和批量处理',
      noBorrow: '暂无未处理的借货明细',
      noStock: '您名下暂无库存',
      addBorrow: '我要借货',
      availableStock: '可用库存',
      lastChange: '最后变动',
      noSaleRecord: '暂无销售记录'
    }
  },

  onShow: function() {
    this.setData({ currentPage: 1, stockPage: 1 });
    this.refreshData();
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh: function() {
    this.setData({ currentPage: 1, stockPage: 1 });
    this.refreshData().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  getLoginInfo: function() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    const userId = wx.getStorageSync('userId') || userInfo._id;
    return {
      userInfo: userInfo,
      userId: userId,
      isRoot: userInfo.role === 'root'
    };
  },

  refreshData: function() {
    var that = this;
    var info = this.getLoginInfo();
    var userId = info.userId;
    var isRoot = info.isRoot;

    if (!userId) return Promise.resolve();

    this.setData({ loading: true });

    var borrowQuery = db.collection('borrow').where({ status: 'pending' });
    if (!isRoot) {
      borrowQuery = borrowQuery.where({ borrowerId: userId });
    }

    return borrowQuery.count().then(function(countRes) {
      var total = countRes.total;
      var pages = Math.ceil(total / that.data.pageSize);
      var skip = (that.data.currentPage - 1) * that.data.pageSize;

      return borrowQuery.orderBy('createTime', 'desc').skip(skip).limit(that.data.pageSize).get().then(function(borrows) {
        return { total: total, pages: pages, borrows: borrows };
      });
    }).then(function(result) {
      var stockQuery = db.collection('user_goods');
      if (!isRoot) {
        stockQuery = stockQuery.where({ userId: userId });
      }

      return stockQuery.count().then(function(stockCountRes) {
        var stockTotal = stockCountRes.total;
        var stockPages = Math.ceil(stockTotal / that.data.pageSize);
        var stockSkip = (that.data.stockPage - 1) * that.data.pageSize;

        return stockQuery.orderBy('updateTime', 'desc').skip(stockSkip).limit(that.data.pageSize).get().then(function(stocks) {
          return {
            total: result.total,
            pages: result.pages,
            borrows: result.borrows,
            stocks: stocks,
            stockTotal: stockTotal,
            stockPages: stockPages
          };
        });
      });
    }).then(function(result) {
      var borrows = result.borrows;
      var stocks = result.stocks;
      var customerMap = {};

      borrows.data.forEach(function(item) {
        var custId = item.locationId || item.contactId || 'unknown';
        var custName = item.locationName || item.contactName || '未填写客户';

        if (!customerMap[custId]) {
          customerMap[custId] = {
            groupKey: custId,
            customerId: custId,
            customerName: custName,
            lastBorrowDate: that.formatDate(item.borrowDate || item.createTime),
            totalItems: 0,
            displayGoods: [],
            items: []
          };
        }

        customerMap[custId].totalItems += 1;
        customerMap[custId].items.push(item);

        if (customerMap[custId].displayGoods.length < 3) {
          customerMap[custId].displayGoods.push({
            name: item.goodsName,
            qty: item.quantity,
            unit: item.unit || ''
          });
        }
      });

      var sortedGroups = Object.values(customerMap).sort(function(a, b) {
        return b.totalItems - a.totalItems;
      });

      that.setData({
        customerGroups: sortedGroups,
        stockList: stocks.data,
        totalCount: result.total,
        totalPages: result.pages,
        stockTotalCount: result.stockTotal,
        stockTotalPages: result.stockPages,
        loading: false
      });
    }).catch(function(err) {
      console.error('刷新借货数据失败', err);
      that.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  formatDate: function(time) {
    if (!time) return '';
    var d = new Date(time);
    if (isNaN(d.getTime())) return '';
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
  },

  prevPage: function() {
    if (this.data.currentPage > 1) {
      this.setData({ currentPage: this.data.currentPage - 1 });
      this.refreshData();
    }
  },

  nextPage: function() {
    if (this.data.currentPage < this.data.totalPages) {
      this.setData({ currentPage: this.data.currentPage + 1 });
      this.refreshData();
    }
  },

  prevStockPage: function() {
    if (this.data.stockPage > 1) {
      this.setData({ stockPage: this.data.stockPage - 1 });
      this.refreshData();
    }
  },

  nextStockPage: function() {
    if (this.data.stockPage < this.data.stockTotalPages) {
      this.setData({ stockPage: this.data.stockPage + 1 });
      this.refreshData();
    }
  },

  switchTab: function(e) {
    var tab = e.currentTarget.dataset.tab;
    if (tab === 'stock') {
      this.setData({ tab: tab, stockPage: 1 });
    } else {
      this.setData({ tab: tab });
    }
  },

  goToDetail: function(e) {
    var id = e.currentTarget.dataset.id;
    var name = e.currentTarget.dataset.name;
    wx.navigateTo({ url: '/pages/borrow/detail?id=' + id + '&customer=' + encodeURIComponent(name) });
  },

  goToAdd: function() {
    wx.navigateTo({ url: '/pages/borrow/add' });
  }
});
