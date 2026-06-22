/**
 * 客户/存放位置添加/编辑页（源码重写）
 */
var db = wx.cloud.database();

Page({
  data: {
    id: '',
    name: '',
    remark: '',
    isEdit: false
  },

  onLoad: function (options) {
    if (options.id) {
      this.setData({ id: options.id, isEdit: true });
      this.loadCustomer(options.id);
    }
  },

  loadCustomer: function (id) {
    var that = this;
    db.collection('customer').doc(id).get().then(function (res) {
      that.setData({
        name: res.data.name || '',
        remark: res.data.remark || ''
      });
    }).catch(function (err) {
      console.error('加载失败', err);
    });
  },

  onNameInput: function (e) {
    this.setData({ name: e.detail.value });
  },

  onRemarkInput: function (e) {
    this.setData({ remark: e.detail.value });
  },

  submit: function () {
    var that = this;
    if (!this.data.name) {
      wx.showToast({ title: '请填写存放位置', icon: 'none' });
      return;
    }

    var data = {
      name: this.data.name,
      remark: this.data.remark,
      updateTime: db.serverDate()
    };

    var that = this;
    var action = this.data.isEdit ? 'update' : 'add';
    wx.cloud.callFunction({
      name: 'contactManage',
      data: {
        userId: wx.getStorageSync('userId'),
        sessionToken: wx.getStorageSync('sessionToken'),
        action: action,
        collection: 'customer',
        id: this.data.isEdit ? this.data.id : undefined,
        data: data
      }
    }).then(function (res) {
      if (res.result && res.result.success) {
        wx.showToast({ title: '保存成功' });
        setTimeout(function () { wx.navigateBack(); }, 1500);
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '保存失败', icon: 'none' });
      }
    }).catch(function (err) {
      console.error('保存失败', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  },

  goBack: function () {
    wx.navigateBack();
  }
});
