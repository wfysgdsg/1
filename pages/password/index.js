/**
 * 修改密码逻辑 (反编译还原整理)
 * 整理日期：2024-03-26
 */
const CLIENT_SALT = 'personal_assets_salt_2024';
const { md5 } = require('../../utils/util');

Page({
  data: {
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
    loading: false,
    uiText: {
      oldPassword: '当前密码',
      oldPasswordPlaceholder: '请输入当前密码',
      newPassword: '新密码',
      newPasswordPlaceholder: '请输入新密码',
      confirmPassword: '确认新密码',
      confirmPasswordPlaceholder: '请再次输入新密码',
      cancel: '取消',
      save: '保存',
    },
  },

  onShow: function () {
    // 强制登录校验
    if (!wx.getStorageSync('userInfo')) {
      wx.redirectTo({ url: '/pages/login/login' });
    }
  },

  // 输入绑定
  onOldPasswordInput: function(e) { this.setData({ oldPassword: e.detail.value }) },
  onNewPasswordInput: function(e) { this.setData({ newPassword: e.detail.value }) },
  onConfirmPasswordInput: function(e) { this.setData({ confirmPassword: e.detail.value }) },

  /**
   * 提交修改密码
   */
  async submit() {
    const { oldPassword, newPassword, confirmPassword } = this.data;

    // 1. 表单校验
    if (!oldPassword || !newPassword || !confirmPassword) {
      wx.showToast({ title: '请填写完整', icon: 'none' });
      return;
    }
    if (newPassword !== confirmPassword) {
      wx.showToast({ title: '两次新密码不一致', icon: 'none' });
      return;
    }
    
    // 密码强度校验：至少 6 位，且包含字母和数字
    const strengthRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,}$/;
    if (!strengthRegex.test(newPassword)) {
      wx.showToast({ title: '密码需至少 6 位并包含字母和数字', icon: 'none', duration: 2500 });
      return;
    }

    this.setData({ loading: true });
    wx.showLoading({ title: '修改中...' });

    try {
      // 2. 调用用户管理云函数，对密码进行 MD5 处理
      const res = await wx.cloud.callFunction({
        name: 'userManage',
        data: {
          action: 'changePassword',
          userId: wx.getStorageSync('userId'),
          sessionToken: wx.getStorageSync('sessionToken'),
          oldPassword: md5(oldPassword + CLIENT_SALT),
          newPassword: md5(newPassword + CLIENT_SALT),
        },
      });

      wx.hideLoading();
      this.setData({ loading: false });

      const result = res.result;
      if (result && result.success) {
        // 如果后端返回了新的 Token 则更新
        if (result.sessionToken) {
          wx.setStorageSync('sessionToken', result.sessionToken);
        }
        
        wx.showToast({ title: '密码修改成功', icon: 'success' });
        
        setTimeout(() => {
          wx.navigateBack();
        }, 1200);
      } else {
        wx.showToast({
          title: (result && result.message) || '修改失败',
          icon: 'none',
        });
      }

    } catch (err) {
      wx.hideLoading();
      this.setData({ loading: false });
      console.error('修改密码失败', err);
      wx.showToast({ title: '服务异常，请稍后重试', icon: 'none' });
    }
  },

  goBack: () => wx.navigateBack(),
});
