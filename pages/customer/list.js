/**
 * 客户/存放位置列表页（源码重写）
 */
var db = wx.cloud.database();
var { escapeRegExp } = require('../../utils/db');

Page({
  data: {
    customerList: [],
    searchKeyword: ''
  },

  onShow: function () {
    this.loadCustomers();
  },

  loadCustomers: function () {
    var that = this;
    var query = db.collection('customer').orderBy('createTime', 'desc');

    if (this.data.searchKeyword) {
      query = query.where({
        name: db.RegExp({ regexp: escapeRegExp(this.data.searchKeyword), options: 'i' })
      });
    }

    query.get().then(function (res) {
      that.setData({ customerList: res.data || [] });
    }).catch(function (err) {
      console.error('加载送货单位失败', err);
    });
  },

  onSearch: function (e) {
    this.setData({ searchKeyword: e.detail.value });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    var that = this;
    this._searchTimer = setTimeout(function() { that.loadCustomers(); }, 350);
  },

  goToAdd: function () {
    wx.navigateTo({ url: '/pages/customer/add' });
  },

  editCustomer: function (e) {
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/customer/add?id=' + id });
  },

  deleteCustomer: function (e) {
    var that = this;
    var id = e.currentTarget.dataset.id;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除该存放位置吗？',
      success: function (res) {
        if (!res.confirm) return;

        wx.cloud.callFunction({
          name: 'contactManage',
          data: {
            userId: wx.getStorageSync('userId'),
            sessionToken: wx.getStorageSync('sessionToken'),
            action: 'delete',
            collection: 'customer',
            id: id
          }
        }).then(function (res) {
          if (res.result && res.result.success) {
            wx.showToast({ title: '删除成功' });
            that.loadCustomers();
          } else {
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }).catch(function (err) {
          console.error('删除失败', err);
          wx.showToast({ title: '删除失败', icon: 'none' });
        });
      }
    });
  }
});
