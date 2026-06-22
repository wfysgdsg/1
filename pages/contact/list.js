/**
 * 联系人列表页逻辑 (反编译还原整理)
 * 整理日期：2024-03-26
 */
const db = wx.cloud.database();
const { escapeRegExp } = require('../../utils/db');
const _ = db.command;

Page({
  data: {
    _anim: true,
    contactList: [],
    searchKeyword: '',
    activeTab: 'all',
    currentPage: 1,
    pageSize: 10,
    totalCount: 0,
    totalPages: 0,
  },

  onShow: function () {this.loadContacts();
  },

  /**
   * 加载联系人列表
   */
  async loadContacts() {
    try {
      wx.showLoading({ title: '加载中...' });
      
      const currentPage = this.data.currentPage;
      const pageSize = this.data.pageSize;
      const searchKeyword = this.data.searchKeyword;

      // 构建组合查询条件
      var conditions = [];

      // 按类型筛选（缺失 type 字段的旧数据视为客户）
      if (this.data.activeTab === 'customer') {
        conditions.push(_.or([
          { type: 'customer' },
          { type: _.exists(false) }
        ]));
      } else if (this.data.activeTab === 'supplier') {
        conditions.push({ type: 'supplier' });
      }
      // activeTab === 'all' 时不加类型条件

      if (searchKeyword) {
        conditions.push(_.or([
          { name: db.RegExp({ regexp: escapeRegExp(searchKeyword), options: 'i' }) },
          { note: db.RegExp({ regexp: escapeRegExp(searchKeyword), options: 'i' }) }
        ]));
      }

      var query = db.collection('contacts');
      if (conditions.length > 0) {
        query = query.where(_.and(conditions));
      }
      query = query.orderBy('createTime', 'desc');

      // 获取总数
      const countRes = await query.count();
      const total = countRes.total;
      const pages = Math.ceil(total / pageSize);
      const skip = (currentPage - 1) * pageSize;

      // 分页获取数据
      const res = await query.skip(skip).limit(pageSize).get();

      this.setData({
        contactList: res.data || [],
        totalCount: total,
        totalPages: pages,
      });
      wx.hideLoading();

    } catch (err) {
      console.error('加载联系人失败', err);
      wx.hideLoading();
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onSearch: function (e) {
    this.setData({ searchKeyword: e.detail.value, currentPage: 1 });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    var that = this;
    this._searchTimer = setTimeout(function() { that.loadContacts(); }, 350);
  },

  switchTab: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab, currentPage: 1 });
    this.loadContacts();
  },

  prevPage: function () {
    if (this.data.currentPage > 1) {
      this.setData({ currentPage: this.data.currentPage - 1 });
      this.loadContacts();
    }
  },

  nextPage: function () {
    if (this.data.currentPage < this.data.totalPages) {
      this.setData({ currentPage: this.data.currentPage + 1 });
      this.loadContacts();
    }
  },

  goToAdd: function() { wx.navigateTo({ url: '/pages/contact/add' }); },

  editContact: function(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/contact/add?id=${id}` });
  },

  /**
   * 删除联系人
   */
  async deleteContact(e) {
    const id = e.currentTarget.dataset.id;

    const confirmRes = await wx.showModal({
      title: '确认删除',
      content: '确定要删除该联系人吗？',
    });

    if (!confirmRes.confirm) return;

    try {
      var res = await wx.cloud.callFunction({
        name: 'contactManage',
        data: {
          userId: wx.getStorageSync('userId'),
          sessionToken: wx.getStorageSync('sessionToken'),
          action: 'delete',
          collection: 'contacts',
          id: id
        }
      });
      if (res.result && res.result.success) {
        wx.showToast({ title: '删除成功' });
        this.loadContacts();
      } else {
        wx.showToast({ title: '删除失败', icon: 'none' });
      }
    } catch (err) {
      console.error('删除失败', err);
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
  }
});
