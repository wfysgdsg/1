/**
 * 联系人列表页逻辑 (反编译还原整理)
 * 整理日期：2024-03-26
 */
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    contactList: [],
    searchKeyword: '',
    activeTab: 'all',
    currentPage: 1,
    pageSize: 10,
    totalCount: 0,
    totalPages: 0,
  },

  onShow: function () {
    this.setData({ currentPage: 1 });
    this.loadContacts();
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

      let query = db.collection('contacts').orderBy('createTime', 'desc');

      if (searchKeyword) {
        query = query.where({
          name: db.RegExp({
            regexp: searchKeyword,
            options: 'i',
          }),
        });
      }

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
    this.setData({
      searchKeyword: e.detail.value,
      currentPage: 1,
    });
    this.loadContacts();
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

  goToAdd: () => wx.navigateTo({ url: '/pages/contact/add' }),

  editContact: (e) => {
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
      await db.collection('contacts').doc(id).remove();
      wx.showToast({ title: '删除成功' });
      this.loadContacts();
    } catch (err) {
      console.error('删除失败', err);
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
  }
});
