/**
 * 借货调货处理页
 * 整理日期：2026-04-09
 * 修复：rejectTransfer/acceptTransfer 改为调用 transferManage 云函数（事务保证原子性）
 * 新增：处理记录 Tab，发方接方都能看到历史
 */
const db = wx.cloud.database();
const _ = db.command;
const { fetchAll } = require('../../utils/db');

Page({
  data: {
    _anim: true,
    tab: 'pending',
    requestList: [],
    historyList: [],
    allHistoryCache: [],
    historyPage: 1,
    historyPageSize: 10,
    historyTotalPages: 0,
    historyTotalCount: 0,
    loading: false
  },

  onShow: function () {this.loadRequests();
    this.loadHistory();
  },

  onPullDownRefresh: function () {
    this.setData({ historyPage: 1 });
    this.loadRequests();
    this.loadHistory();
  },

  switchTab: function (e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  loadRequests: function () {
    var that = this;
    var userInfo = wx.getStorageSync('userInfo') || {};
    this.setData({ loading: true });

    db.collection('transfer_requests')
      .where({ receiverId: userInfo._id, status: 'pending' })
      .orderBy('createTime', 'desc')
      .get()
      .then(function (res) {
        var list = (res.data || []).map(function (item) {
          item.timeStr = that.formatTime(item.createTime);
          return item;
        });
        that.setData({ requestList: list });
        wx.stopPullDownRefresh();
      })
      .catch(function (err) {
        console.error('加载申请失败', err);
      })
      .finally(function () {
        that.setData({ loading: false });
      });
  },

  loadHistory: function () {
    var that = this;
    var userInfo = wx.getStorageSync('userInfo') || {};

    fetchAll(function() {
      return db.collection('transfer_requests')
        .where(_.and([
          { status: _.neq('pending') },
          _.or([{ senderId: userInfo._id }, { receiverId: userInfo._id }])
        ]))
        .orderBy('createTime', 'desc');
    }, { pageSize: 100 })
      .then(function (allRecords) {
        var formatted = allRecords.map(function (item) {
          item.timeStr = that.formatTime(item.createTime);
          return item;
        });
        var total = formatted.length;
        var totalPages = Math.ceil(total / that.data.historyPageSize);
        var page = Math.min(that.data.historyPage, totalPages || 1);
        var start = (page - 1) * that.data.historyPageSize;
        that.setData({
          allHistoryCache: formatted,
          historyList: formatted.slice(start, start + that.data.historyPageSize),
          historyTotalCount: total,
          historyTotalPages: totalPages,
          historyPage: page
        });
      })
      .catch(function (err) {
        console.error('加载历史失败', err);
      });
  },

  prevHistoryPage: function () {
    if (this.data.historyPage <= 1) return;
    var page = this.data.historyPage - 1;
    var start = (page - 1) * this.data.historyPageSize;
    this.setData({
      historyPage: page,
      historyList: this.data.allHistoryCache.slice(start, start + this.data.historyPageSize)
    });
  },

  nextHistoryPage: function () {
    if (this.data.historyPage >= this.data.historyTotalPages) return;
    var page = this.data.historyPage + 1;
    var start = (page - 1) * this.data.historyPageSize;
    this.setData({
      historyPage: page,
      historyList: this.data.allHistoryCache.slice(start, start + this.data.historyPageSize)
    });
  },

  formatTime: function (time) {
    if (!time) return '';
    var d = new Date(time);
    if (isNaN(d.getTime())) return '';
    var y = d.getFullYear();
    var M = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    var h = String(d.getHours()).padStart(2, '0');
    var m = String(d.getMinutes()).padStart(2, '0');
    return y + '-' + M + '-' + dd + ' ' + h + ':' + m;
  },

  /**
   * 拒绝调货（云函数事务版）
   */
  rejectTransfer: function (e) {
    var that = this;
    var id = e.currentTarget.dataset.id;
    var item = this.data.requestList.find(function (r) { return r._id === id; });

    if (!item) return;

    wx.showModal({
      title: '确认拒绝',
      content: '确定要拒绝来自 ' + (item.senderName || '') + ' 的移货申请吗？',
      success: function (res) {
        if (!res.confirm) return;

        wx.showLoading({ title: '处理中...' });

        var userId = wx.getStorageSync('userId');
        var sessionToken = wx.getStorageSync('sessionToken');

        wx.cloud.callFunction({
          name: 'transferManage',
          data: {
            userId: userId,
            sessionToken: sessionToken,
            transferRequestId: id,
            action: 'reject',
          },
        }).then(function (res) {
          wx.hideLoading();
          if (res.result && res.result.success) {
            wx.showToast({ title: '已拒绝', icon: 'success' });
            that.loadRequests();
          } else {
            wx.showToast({ title: (res.result && res.result.message) || '操作失败', icon: 'none' });
          }
        }).catch(function (err) {
          wx.hideLoading();
          console.error('拒绝失败', err);
          wx.showToast({ title: '操作失败', icon: 'none' });
        });
      }
    });
  },

  /**
   * 接受调货（云函数事务版）
   */
  acceptTransfer: function (e) {
    var that = this;
    var id = e.currentTarget.dataset.id;
    var item = this.data.requestList.find(function (r) { return r._id === id; });

    if (!item) return;

    wx.showModal({
      title: '确认收货',
      content: '确认接收 ' + (item.senderName || '') + ' 移交给您的商品？收货后可在借货列表中归还。',
      success: function (res) {
        if (!res.confirm) return;

        wx.showLoading({ title: '正在办理移交...', mask: true });

        var userId = wx.getStorageSync('userId');
        var sessionToken = wx.getStorageSync('sessionToken');

        wx.cloud.callFunction({
          name: 'transferManage',
          data: {
            userId: userId,
            sessionToken: sessionToken,
            transferRequestId: id,
            action: 'accept',
          },
        }).then(function (res) {
          wx.hideLoading();
          if (res.result && res.result.success) {
            wx.showToast({ title: '收货成功', icon: 'success' });
            that.loadRequests();
          } else {
            wx.showToast({ title: (res.result && res.result.message) || '操作失败', icon: 'none' });
          }
        }).catch(function (err) {
          wx.hideLoading();
          console.error('移交失败', err);
          wx.showToast({ title: '操作失败', icon: 'none' });
        });
      }
    });
  },
});
