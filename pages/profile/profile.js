/**
 * 个人中心逻辑 (反编译还原整理)
 * 整理日期：2024-03-26
 */
Page({
  data: {
    userInfo: {},
    isLogged: false,
    isAdmin: false,
    uiText: {
      notLoggedIn: '未登录',
      admin: '管理员',
      staff: '员工',
      changePassword: '修改密码',
      exportData: '数据导出',
      report: '销售报表',
      manageStaff: '员工管理',
      about: '关于',
      logout: '退出登录',
    },
  },

  onShow: function () {
    this.checkLoginStatus();
  },

  /**
   * 校验登录状态并设置权限
   */
  checkLoginStatus: function () {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({
        userInfo: userInfo,
        isLogged: true,
        isAdmin: userInfo.role === 'root'
      });
    } else {
      this.setData({
        userInfo: {},
        isLogged: false,
        isAdmin: false
      });
    }
  },

  // 导航跳转逻辑
  changePassword: function () {
    if (!this.ensureLogin()) return;
    wx.navigateTo({ url: '/pages/password/index' });
  },

  exportData: function () {
    if (!this.ensureLogin()) return;
    wx.navigateTo({ url: '/pages/export/index' });
  },

  viewReport: function () {
    if (!this.ensureLogin()) return;
    wx.navigateTo({ url: '/pages/report/month' });
  },

  manageStaff: function () {
    if (!this.ensureLogin()) return;
    wx.navigateTo({ url: '/pages/staff/index' });
  },

  /**
   * 同步商品库
   */
  syncGoods: function () {
    if (!this.ensureLogin()) return;
    wx.showLoading({ title: '同步中...' });
    wx.cloud.callFunction({
      name: 'syncGoods',
      data: { action: 'sync' },
      success: res => {
        wx.hideLoading();
        if (res.result && res.result.success) {
          wx.showModal({
            title: '同步成功',
            content: res.result.message,
            showCancel: false
          });
        } else {
          wx.showModal({
            title: '同步失败',
            content: res.result ? res.result.message : '未知错误',
            showCancel: false
          });
        }
      },
      fail: err => {
        wx.hideLoading();
        wx.showModal({
          title: '同步失败',
          content: err.message || '请先在开发者工具部署 syncGoods 云函数',
          showCancel: false
        });
      }
    });
  },

  /**
   * 登录检查保底
   */
  ensureLogin: function () {
    if (!this.data.isLogged) {
      wx.navigateTo({ url: '/pages/login/login' });
      return false;
    }
    return true;
  },

  about: function () {
    wx.showModal({
      title: '关于',
      content: '个人借销货管理系统 v1.0\n\n帮助您高效管理借货、销售和库存账目。',
      showCancel: false,
    });
  },

  /**
   * 退出登录逻辑
   */
  logout: function () {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          // 清除所有登录相关的本地缓存
          wx.removeStorageSync('userInfo');
          wx.removeStorageSync('userId');
          wx.removeStorageSync('sessionToken');
          wx.setStorageSync('autoLogin', false);
          
          this.setData({
            userInfo: {},
            isLogged: false,
            isAdmin: false
          });

          wx.showToast({ title: '已退出登录' });
          
          setTimeout(() => {
            wx.redirectTo({ url: '/pages/login/login' });
          }, 1000);
        }
      },
    });
  },
});
