/**
 * 商品列表页逻辑
 */
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    goodsList: [],
    searchKeyword: '',
    currentPage: 1,
    pageSize: 10,
    totalCount: 0,
    totalPages: 0
  },

  onShow: function() {
    this.setData({ currentPage: 1 });
    this.loadGoods();
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh: function() {
    this.setData({ currentPage: 1, searchKeyword: '' });
    this.loadGoods().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  loadGoods: function() {
    const that = this;
    wx.showLoading({ title: '加载中...' });

    const currentPage = this.data.currentPage;
    const pageSize = this.data.pageSize;
    const searchKeyword = this.data.searchKeyword;

    let collection = db.collection('goods');
    let query = collection;

    if (searchKeyword) {
      query = query.where({
        name: db.RegExp({
          regexp: searchKeyword,
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
      that.setData({
        goodsList: result.data || [],
        totalCount: result.total,
        totalPages: result.pages
      });
      console.log('第 ' + currentPage + ' 页加载完成，共 ' + result.total + ' 条');
      wx.hideLoading();
    }).catch(function(err) {
      console.error('加载商品失败', err);
      wx.hideLoading();
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
    this.setData({
      searchKeyword: e.detail.value,
      currentPage: 1
    });
    this.loadGoods();
  },

  goToAdd: function() {
    wx.navigateTo({ url: '/pages/goods/add' });
  },

  editGoods: function(e) {
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/goods/add?id=' + id });
  },

  deleteGoods: function(e) {
    var that = this;
    var id = e.currentTarget.dataset.id;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个商品吗？系统会检查该商品是否仍有未结清的借货。',
      success: function(confirmRes) {
        if (!confirmRes.confirm) return;

        wx.showLoading({ title: '检查中...' });

        db.collection('borrow').where({ goodsId: id, status: 'pending' }).count().then(function(borrowCount) {
          if (borrowCount.total > 0) {
            wx.hideLoading();
            wx.showModal({
              title: '无法删除',
              content: '该商品尚有待归还的借货记录，请处理完后再删除。',
              showCancel: false
            });
            return;
          }

          return db.collection('goods').doc(id).remove();
        }).then(function() {
          wx.hideLoading();
          wx.showToast({ title: '删除成功', icon: 'success' });
          that.loadGoods();
        }).catch(function(err) {
          wx.hideLoading();
          console.error('删除失败', err);
          wx.showToast({ title: '删除失败', icon: 'none' });
        });
      }
    });
  }
});