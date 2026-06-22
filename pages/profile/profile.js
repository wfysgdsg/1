/**
 * 个人中心逻辑 (反编译还原整理)
 * 整理日期：2024-03-26
 */
Page({
  data: {
    _anim: true,
    userInfo: {},
    displayName: '',
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
    this.setData({ _anim: false });
    var that = this;
    setTimeout(function () { that.setData({ _anim: true }); }, 50);
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
        displayName: userInfo.nickname || userInfo.name || userInfo.username || '未登录',
        isLogged: true,
        isAdmin: userInfo.role === 'root'
      });

      // 将 cloud:// fileID 转为临时 URL 用于显示头像
      const cloudFileId = userInfo.avatarUrl;
      if (cloudFileId && cloudFileId.indexOf('cloud://') === 0) {
        const that = this;
        wx.cloud.getTempFileURL({
          fileList: [cloudFileId],
          success: function (res) {
            if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
              that.setData({ 'userInfo.avatarUrl': res.fileList[0].tempFileURL });
            }
          }
        });
      }
    } else {
      this.setData({
        userInfo: {},
        displayName: '未登录',
        isLogged: false,
        isAdmin: false
      });
    }
  },

  editProfile: function () {
    if (!this.ensureLogin()) return;
    wx.navigateTo({ url: '/pages/profile/edit' });
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
    wx.navigateTo({ url: '/pages/report/index' });
  },

  viewDeliveryList: function () {
    if (!this.ensureLogin()) return;
    wx.navigateTo({ url: '/pages/sale/delivery-list' });
  },

  manageStaff: function () {
    if (!this.ensureLogin()) return;
    wx.navigateTo({ url: '/pages/staff/index' });
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
          wx.removeStorageSync('rememberPassword');
          wx.removeStorageSync('rememberedUsername');
          wx.removeStorageSync('rememberToken');
          wx.removeStorageSync('autoLogin');
          
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
