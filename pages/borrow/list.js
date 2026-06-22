/**
 * 借货列表页逻辑
 * 修复日期：2026-04-09
 * 修复：分组统计从"当前页"改为"全量数据"，解决分页导致统计不全的问题
 */
const db = wx.cloud.database();
const _ = db.command;
const { fetchAll } = require('../../utils/db');

Page({
  data: {
    _anim: true,
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
    allBorrowsCache: [],
    searchKeyword: '',
    sortBy: 'count',
    stockSortBy: 'time',
    allCustomerGroups: [],
    allStockList: [],
    uiText: {
      detailTab: '📋 借货明细',
      stockTab: '📦 我的库存',
      searchBorrow: '搜客户或商品名',
      searchStock: '搜商品名',
      sortCount: '数量 多→少',
      sortTime: '最近借货 新→旧',
      stockSortName: '名称 A→Z',
      stockSortTime: '最近变动',
      stockSortQty: '库存 多→少',
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
    this.setData({ _anim: false, currentPage: 1, stockPage: 1 });
    setTimeout(() => this.setData({ _anim: true }), 50);

    // 缓存优先：先显示缓存数据，再后台静默刷新
    var info = this.getLoginInfo();
    var cacheKey = 'borrow_cache_' + (info.userId || 'anon');
    var cached = wx.getStorageSync(cacheKey);
    if (cached && cached.groups) {
      this.setData({
        allCustomerGroups: cached.groups,
        allStockList: cached.stocks || []
      });
      this.applyFilters();
      this.refreshData(true); // 后台静默刷新
    } else {
      this.refreshData(false); // 首次加载
    }
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh: function() {
    this.setData({ currentPage: 1, stockPage: 1, allBorrowsCache: [] });
    this.refreshData(false).then(() => {
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

  /**
   * 核心修复：先拿全量数据，再在前端分组 + 分页
   * 解决之前"先分页再分组"导致的统计错误
   */
  refreshData: function(silent) {
    var that = this;
    var info = this.getLoginInfo();
    var userId = info.userId;
    var isRoot = info.isRoot;

    if (!userId) return Promise.resolve();

    if (!silent) this.setData({ loading: true });

    // 构建查询条件（用 _.and 合并，避免链式 where 的不确定性）
    var borrowConditions = [{ status: 'pending' }];
    if (!isRoot) {
      borrowConditions.push({ borrowerId: userId });
    }
    // ========== 修复：一次性拿全量数据，再前端分组 ==========
    return fetchAll(function() {
      return db.collection('borrow').where(_.and(borrowConditions)).orderBy('createTime', 'desc');
    }, { pageSize: 100 })
      .then(function(allBorrows) {
        // ---- 1. 处理借货分组 ----
        var customerMap = {};

        allBorrows.forEach(function(item) {
          var custId = item.locationId || item.contactId || 'unknown';
          var custName = item.locationName || item.contactName || '未填写客户';

          if (!customerMap[custId]) {
            customerMap[custId] = {
              groupKey: custId,
              customerId: custId,
              customerName: custName,
              lastBorrowDate: that.formatDate(item.borrowDate || item.createTime),
              lastBorrowTimestamp: item.borrowDate || item.createTime,
              totalItems: 0,
              displayGoods: [],
              items: []
            };
          }

          customerMap[custId].totalItems += 1;
          customerMap[custId].items.push(item);

          // 只保留前3条预览商品
          if (customerMap[custId].displayGoods.length < 3) {
            customerMap[custId].displayGoods.push({
              name: item.goodsName,
              qty: item.quantity,
              unit: item.unit || ''
            });
          }
        });

        // 按总数量排序
        var sortedGroups = Object.values(customerMap).sort(function(a, b) {
          return b.totalItems - a.totalItems;
        });

        // 缓存全量数据和分组
        that.setData({ allBorrowsCache: allBorrows, allCustomerGroups: sortedGroups });

        // ---- 2. 库存数据全量获取 ----
        return fetchAll(function() {
          var q = db.collection('user_goods');
          if (!isRoot) {
            q = q.where({ userId: userId });
          }
          return q.orderBy('updateTime', 'desc');
        }, { pageSize: 100 }).then(function(allStocks) {
          // JS 端过滤 stock > 0（避免 command 在循环中失效）
          var filtered = (allStocks || []).filter(function(s) { return (s.stock || 0) > 0; });

          // 写入缓存
          wx.setStorageSync('borrow_cache_' + userId, {
            groups: sortedGroups,
            stocks: filtered,
            time: Date.now()
          });

          that.setData({ allStockList: filtered, loading: false });
          that.applyFilters();
        });
      })
      .catch(function(err) {
        console.error('刷新借货数据失败', err);
        that.setData({ loading: false });
        if (!silent) wx.showToast({ title: '加载失败', icon: 'none' });
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

  onSearchInput: function(e) {
    this.setData({ searchKeyword: e.detail.value, currentPage: 1, stockPage: 1 });
    this.applyFilters();
  },

  onSortChange: function(e) {
    var val = e.detail.value;
    var options = ['count', 'time'];
    this.setData({ sortBy: options[val] || 'count', currentPage: 1 });
    this.applyFilters();
  },

  onStockSortChange: function(e) {
    var val = e.detail.value;
    var options = ['time', 'name', 'qty'];
    this.setData({ stockSortBy: options[val] || 'time', stockPage: 1 });
    this.applyFilters();
  },

  applyFilters: function() {
    var that = this;
    var keyword = this.data.searchKeyword.trim().toLowerCase();
    var sortBy = this.data.sortBy;
    var pageSize = this.data.pageSize;

    // --- 客户明细过滤 ---
    var filteredGroups = this.data.allCustomerGroups;

    if (keyword) {
      filteredGroups = filteredGroups.filter(function(g) {
        if (g.customerName.toLowerCase().indexOf(keyword) > -1) return true;
        return g.items.some(function(item) {
          return item.goodsName && item.goodsName.toLowerCase().indexOf(keyword) > -1;
        });
      });
    }

    // 排序
    if (sortBy === 'time') {
      filteredGroups = filteredGroups.slice().sort(function(a, b) {
        return (b.lastBorrowTimestamp || 0) - (a.lastBorrowTimestamp || 0);
      });
    } else {
      filteredGroups = filteredGroups.slice().sort(function(a, b) {
        return b.totalItems - a.totalItems;
      });
    }

    var groupsTotal = filteredGroups.length;
    var totalPages = Math.ceil(groupsTotal / pageSize);
    var currentPage = Math.min(that.data.currentPage, totalPages || 1);
    var start = (currentPage - 1) * pageSize;
    var pageGroups = filteredGroups.slice(start, start + pageSize);

    // --- 库存过滤 ---
    var filteredStock = this.data.allStockList.slice();
    if (keyword) {
      filteredStock = filteredStock.filter(function(s) {
        return s.goodsName && s.goodsName.toLowerCase().indexOf(keyword) > -1;
      });
    }

    // 库存排序
    var stockSortBy = this.data.stockSortBy;
    if (stockSortBy === 'name') {
      filteredStock.sort(function(a, b) {
        return (a.goodsName || '').localeCompare(b.goodsName || '');
      });
    } else if (stockSortBy === 'qty') {
      filteredStock.sort(function(a, b) {
        return (b.stock || 0) - (a.stock || 0);
      });
    } else {
      // 默认按时间排序（最近变动）
      filteredStock.sort(function(a, b) {
        return (b.lastSaleDate || '') > (a.lastSaleDate || '') ? 1 : -1;
      });
    }

    var stockTotal = filteredStock.length;
    var stockPages = Math.ceil(stockTotal / pageSize);
    var stockPage = Math.min(that.data.stockPage, stockPages || 1);
    var stockStart = (stockPage - 1) * pageSize;
    var pageStocks = filteredStock.slice(stockStart, stockStart + pageSize);

    that.setData({
      customerGroups: pageGroups,
      totalCount: groupsTotal,
      totalPages: totalPages,
      currentPage: currentPage,
      stockList: pageStocks,
      stockTotalCount: stockTotal,
      stockTotalPages: stockPages,
      stockPage: stockPage
    });
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
