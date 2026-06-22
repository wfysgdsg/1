/**
 * 新增/编辑联系人页逻辑 (反编译还原整理)
 * 整理日期：2024-03-26
 */
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    id: '',
    name: '',
    type: 'customer', // 默认类型：customer
    note: '',
    isEdit: false,
  },

  onLoad: function (options) {
    if (options.id) {
      this.setData({
        id: options.id,
        isEdit: true
      });
      wx.setNavigationBarTitle({ title: '修改联系人' });
      this.loadContact(options.id);
    }
  },

  /**
   * 加载联系人详情
   */
  async loadContact(id) {
    try {
      const res = await db.collection('contacts').doc(id).get();
      const contact = res.data;
      this.setData({
        name: contact.name,
        type: contact.type || 'customer',
        note: contact.note || '',
      });
    } catch (err) {
      console.error('加载详情失败', err);
    }
  },

  // 输入绑定
  onNameInput: function(e) { this.setData({ name: e.detail.value }); },
  onTypeChange: function(e) { this.setData({ type: e.currentTarget.dataset.type }); },
  onNoteInput: function(e) { this.setData({ note: e.detail.value }); },

  /**
   * 提交保存
   */
  async submit() {
    const { name, type, note } = this.data;

    if (!name) {
      wx.showToast({ title: '请填写名称', icon: 'none' });
      return;
    }

    const contactData = {
      name,
      type,
      note,
      updateTime: db.serverDate(),
    };

    wx.showLoading({ title: '保存中...' });

    try {
      var action = this.data.isEdit ? 'update' : 'add';
      var res = await wx.cloud.callFunction({
        name: 'contactManage',
        data: {
          userId: wx.getStorageSync('userId'),
          sessionToken: wx.getStorageSync('sessionToken'),
          action: action,
          collection: 'contacts',
          id: this.data.isEdit ? this.data.id : undefined,
          data: contactData
        }
      });

      wx.hideLoading();
      if (res.result && res.result.success) {
        wx.showToast({ title: '保存成功' });
        setTimeout(() => wx.navigateBack(), 1500);
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '保存失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('保存失败', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  goBack: function() { wx.navigateBack(); },
});
