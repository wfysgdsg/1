/**
 * 员工管理页（源码重写）
 */
var db = wx.cloud.database();
var fetchAll = require('../../utils/db').fetchAll;

Page({
  data: {
    userList: [],
    isRoot: false
  },

  onShow: function () {
    var userInfo = wx.getStorageSync('userInfo');
    if (!userInfo) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    this.setData({ isRoot: userInfo.role === 'root' });
    if (userInfo.role !== 'root') {
      wx.showToast({ title: '无权限', icon: 'none' });
      wx.navigateBack();
      return;
    }
    this.loadUsers();
  },

  loadUsers: function () {
    var that = this;
    wx.cloud.callFunction({
      name: 'queryData',
      data: {
        userId: wx.getStorageSync('userId'),
        sessionToken: wx.getStorageSync('sessionToken'),
        collection: 'users',
        orderBy: { field: 'createTime', order: 'desc' },
        limit: 100
      }
    }).then(function (res) {
      if (res.result && res.result.success) {
        that.setData({ userList: res.result.data });
      }
    }).catch(function (err) {
      console.error('加载用户失败', err);
      wx.showToast({ title: '加载用户失败', icon: 'none' });
    });
  },

  addUser: function () {
    var that = this;
    wx.showModal({
      title: '添加员工',
      content: '',
      editable: true,
      placeholderText: '请输入员工姓名（用户名）',
      success: function (res) {
        if (!res.confirm || !res.content) return;
        var username = res.content.trim();
        if (!username) return;

        wx.showModal({
          title: '设置密码',
          content: '',
          editable: true,
          placeholderText: '留空则自动生成随机密码',
          success: function (pwdRes) {
            var password = (pwdRes.content || '').trim();

            wx.showLoading({ title: '添加中...' });

            wx.cloud.callFunction({
              name: 'userManage',
              data: {
                userId: wx.getStorageSync('userId'),
                sessionToken: wx.getStorageSync('sessionToken'),
                action: 'add',
                username: username,
                name: username,
                password: password || undefined
              }
            }).then(function (callRes) {
              wx.hideLoading();
              if (callRes.result && callRes.result.success) {
                var initPwd = callRes.result.initialPassword;
                if (initPwd) {
                  wx.showModal({
                    title: '添加成功',
                    content: '初始密码：' + initPwd + '\n请告知员工尽快修改密码',
                    showCancel: false,
                    success: function () { that.loadUsers(); }
                  });
                } else {
                  wx.showToast({ title: '添加成功' });
                  that.loadUsers();
                }
              } else {
                wx.showToast({ title: (callRes.result && callRes.result.message) || '添加失败', icon: 'none' });
              }
            }).catch(function (err) {
              wx.hideLoading();
              console.error('添加员工失败', err);
              wx.showToast({ title: '添加失败', icon: 'none' });
            });
          }
        });
      }
    });
  },

  deleteUser: function (e) {
    var that = this;
    var targetId = e.currentTarget.dataset.id;
    var targetName = e.currentTarget.dataset.name;

    wx.showModal({
      title: '删除员工 - 确认名称',
      content: '',
      editable: true,
      placeholderText: '请输入 "' + targetName + '" 确认删除',
      success: function (res) {
        if (!res.confirm || !res.content) return;
        if (res.content.trim() !== targetName) {
          wx.showToast({ title: '名称不匹配，操作已取消', icon: 'none' });
          return;
        }

        wx.showModal({
          title: '删除员工 - 身份验证',
          content: '',
          editable: true,
          placeholderText: '请输入管理员密码',
          success: function (pwdRes) {
            if (!pwdRes.confirm || !pwdRes.content) return;

            wx.showLoading({ title: '验证中...' });

            wx.cloud.callFunction({
              name: 'userManage',
              data: {
                userId: wx.getStorageSync('userId'),
                sessionToken: wx.getStorageSync('sessionToken'),
                action: 'delete',
                targetUserId: targetId,
                password: pwdRes.content.trim()
              }
            }).then(function (callRes) {
              wx.hideLoading();
              if (callRes.result && callRes.result.success) {
                wx.showToast({ title: '已删除' });
                that.loadUsers();
              } else {
                wx.showToast({ title: (callRes.result && callRes.result.message) || '删除失败', icon: 'none' });
              }
            }).catch(function (err) {
              wx.hideLoading();
              console.error('删除员工失败', err);
              wx.showToast({ title: '删除失败', icon: 'none' });
            });
          }
        });
      }
    });
  },

  resetPassword: function (e) {
    var that = this;
    var targetId = e.currentTarget.dataset.id;

    wx.showModal({
      title: '重置密码',
      content: '',
      editable: true,
      placeholderText: '请输入新密码',
      success: function (res) {
        if (!res.confirm || !res.content) return;
        var newPassword = res.content.trim();
        if (newPassword.length < 6) {
          wx.showToast({ title: '密码至少 6 位', icon: 'none' });
          return;
        }

        wx.showLoading({ title: '处理中...' });

        wx.cloud.callFunction({
          name: 'userManage',
          data: {
            userId: wx.getStorageSync('userId'),
            sessionToken: wx.getStorageSync('sessionToken'),
            action: 'resetPassword',
            targetUserId: targetId,
            newPassword: newPassword
          }
        }).then(function (callRes) {
          wx.hideLoading();
          if (callRes.result && callRes.result.success) {
            wx.showToast({ title: '密码已重置' });
          } else {
            wx.showToast({ title: (callRes.result && callRes.result.message) || '操作失败', icon: 'none' });
          }
        }).catch(function (err) {
          wx.hideLoading();
          console.error('重置密码失败', err);
          wx.showToast({ title: '操作失败', icon: 'none' });
        });
      }
    });
  }
});
