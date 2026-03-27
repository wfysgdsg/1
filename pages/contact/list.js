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
    activeTab: 'all' // 目前业务支持: all (全部)
  },

  onShow: function () {
    this.loadContacts();
  },

  /**
   * 加载联系人列表
   */
  async loadContacts() {
    try {
      let query = db.collection('contacts').orderBy('createTime', 'desc');
      
      const whereCond = {};
      if (this.data.searchKeyword) {
        whereCond.name = db.RegExp({
          regexp: this.data.searchKeyword,
          options: 'i',
        });
      }

      if (Object.keys(whereCond).length > 0) {
        query = query.where(whereCond);
      }

      // 获取数据 (联系人一般不多，直接 get)
      const res = await query.get();
      this.setData({ contactList: res.data || [] });

    } catch (err) {
      console.error('加载联系人失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onSearch: function (e) {
    this.setData({ searchKeyword: e.detail.value });
    this.loadContacts();
  },

  switchTab: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    this.loadContacts();
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
