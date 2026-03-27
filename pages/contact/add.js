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
    contact: '',
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
        contact: contact.contact || '',
        note: contact.note || '',
      });
    } catch (err) {
      console.error('加载详情失败', err);
    }
  },

  // 输入绑定
  onNameInput: (e) => this.setData({ name: e.detail.value }),
  onTypeChange: (e) => this.setData({ type: e.detail.value }),
  onContactInput: (e) => this.setData({ contact: e.detail.value }),
  onNoteInput: (e) => this.setData({ note: e.detail.value }),

  /**
   * 提交保存
   */
  async submit() {
    const { name, type, contact, note } = this.data;

    if (!name) {
      wx.showToast({ title: '请填写名称', icon: 'none' });
      return;
    }

    const contactData = {
      name,
      type,
      contact,
      note,
      updateTime: db.serverDate(),
    };

    wx.showLoading({ title: '保存中...' });

    try {
      if (this.data.isEdit) {
        // 更新
        await db.collection('contacts').doc(this.data.id).update({
          data: contactData
        });
      } else {
        // 新增
        contactData.createTime = db.serverDate();
        await db.collection('contacts').add({
          data: contactData
        });
      }

      wx.hideLoading();
      wx.showToast({ title: '保存成功' });
      setTimeout(() => wx.navigateBack(), 1500);

    } catch (err) {
      wx.hideLoading();
      console.error('保存失败', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  goBack: () => wx.navigateBack(),
});
