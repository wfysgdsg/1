/**
 * 商品列表页逻辑
 */
const db = wx.cloud.database();
const _ = db.command;
const { escapeRegExp } = require('../../utils/db');

Page({
  data: {
    _anim: true,
    goodsList: [],
    searchKeyword: '',
    currentPage: 1,
    pageSize: 10,
    totalCount: 0,
    totalPages: 0,
    isAdmin: false
  },

  onShow: function() {
    this.setData({ _anim: false });
    setTimeout(() => this.setData({ _anim: true }), 50);
    var userInfo = wx.getStorageSync('userInfo');
    this.setData({
      currentPage: 1,
      isAdmin: userInfo && userInfo.role === 'root'
    });

    // 缓存优先：先显示缓存数据，再后台静默刷新
    var cacheKey = 'goods_cache';
    var cached = wx.getStorageSync(cacheKey);
    if (cached && cached.data) {
      this.setData({
        goodsList: cached.data,
        totalCount: cached.total,
        totalPages: cached.pages
      });
      this.loadGoods(true); // 后台静默刷新
    } else {
      this.loadGoods(false); // 首次加载，显示 loading
    }
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh: function() {
    this.setData({ currentPage: 1, searchKeyword: '' });
    this.loadGoods(false).then(() => {
      wx.stopPullDownRefresh();
    });
  },

  loadGoods: function(silent) {
    const that = this;
    if (!silent) wx.showLoading({ title: '加载中...' });

    const currentPage = this.data.currentPage;
    const pageSize = this.data.pageSize;
    const searchKeyword = this.data.searchKeyword;

    let collection = db.collection('goods');
    let query = collection;

    if (searchKeyword) {
      query = query.where({
        name: db.RegExp({
          regexp: escapeRegExp(searchKeyword),
          options: 'i'
        })
      });
    }

    return query.count().then(function(countRes) {
      const total = countRes.total;
      const pages = Math.ceil(total / pageSize);
      const skip = (currentPage - 1) * pageSize;

      return query.orderBy('updateTime', 'desc').orderBy('createTime', 'desc').skip(skip).limit(pageSize).get().then(function(res) {
        return { total: total, pages: pages, data: res.data };
      });
    }).then(function(result) {
      // 写入缓存
      wx.setStorageSync('goods_cache', {
        data: result.data,
        total: result.total,
        pages: result.pages,
        time: Date.now()
      });
      that.setData({
        goodsList: result.data || [],
        totalCount: result.total,
        totalPages: result.pages
      });
      if (!silent) wx.hideLoading();
    }).catch(function(err) {
      console.error('加载商品失败', err);
      if (!silent) wx.hideLoading();
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  prevPage: function() {
    if (this.data.currentPage > 1) {
      this.setData({ currentPage: this.data.currentPage - 1 });
      this.loadGoods();
    }
  },

  nextPage: function() {
    if (this.data.currentPage < this.data.totalPages) {
      this.setData({ currentPage: this.data.currentPage + 1 });
      this.loadGoods();
    }
  },

  onSearch: function(e) {
    this.setData({ searchKeyword: e.detail.value, currentPage: 1 });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    var that = this;
    this._searchTimer = setTimeout(function() { that.loadGoods(); }, 350);
  },

  goToAdd: function() {
    wx.navigateTo({ url: '/pages/goods/add' });
  },

  editGoods: function(e) {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '仅管理员可编辑商品', icon: 'none' });
      return;
    }
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/goods/add?id=' + id });
  },

  deleteGoods: function(e) {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '仅管理员可删除商品', icon: 'none' });
      return;
    }
    var that = this;
    var id = e.currentTarget.dataset.id;
    var userInfo = wx.getStorageSync('userInfo');
    var sessionToken = wx.getStorageSync('sessionToken');

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个商品吗？系统会检查该商品是否仍有未结清的借货。',
      success: function(confirmRes) {
        if (!confirmRes.confirm) return;

        wx.showLoading({ title: '处理中...' });

        wx.cloud.callFunction({
          name: 'goodsManage',
          data: {
            action: 'delete',
            userId: userInfo ? userInfo._id : '',
            sessionToken: sessionToken,
            goodsId: id,
          }
        }).then(function(res) {
          wx.hideLoading();
          if (res.result && res.result.success) {
            wx.showToast({ title: '删除成功', icon: 'success' });
            that.loadGoods();
          } else {
            wx.showToast({ title: (res.result && res.result.message) || '删除失败', icon: 'none' });
          }
        }).catch(function(err) {
          wx.hideLoading();
          console.error('删除失败', err);
          wx.showToast({ title: '删除失败', icon: 'none' });
        });
      }
    });
  }
});