var e = require('../../@babel/runtime/helpers/regeneratorRuntime'),
  t = require('../../@babel/runtime/helpers/asyncToGenerator'),
  CLIENT_SALT = 'personal_assets_salt_2024',
  md5 = require('../../utils/util').md5,
  r = wx.cloud.database(),
  n = require('../../utils/db').fetchAll;
Page({
  data: { userList: [], isRoot: !1 },
  onShow: function () {
    var e = wx.getStorageSync('userInfo');
    if (e) {
      if ((this.setData({ isRoot: 'root' === e.role }), 'root' !== e.role))
        return (
          wx.showToast({ title: '无权限', icon: 'none' }),
          void wx.navigateBack()
        );
      this.loadUsers();
    } else wx.redirectTo({ url: '/pages/login/login' });
  },
  loadUsers: function () {
    var s = this;
    return t(
      e().mark(function t() {
        var a;
        return e().wrap(
          function (e) {
            for (;;)
              switch ((e.prev = e.next)) {
                case 0:
                  return (
                    (e.prev = 0),
                    (e.next = 3),
                    n(r.collection('users').orderBy('createTime', 'desc'))
                  );
                case 3:
                  (a = e.sent), s.setData({ userList: a }), (e.next = 11);
                  break;
                case 7:
                  (e.prev = 7),
                    (e.t0 = e.catch(0)),
                    console.error('加载用户失败', e.t0),
                    wx.showToast({ title: '加载用户失败', icon: 'none' });
                case 11:
                case 'end':
                  return e.stop();
              }
          },
          t,
          null,
          [[0, 7]],
        );
      }),
    )();
  },
  addUser: function () {
    var r = this;
    wx.showModal({
      title: '添加员工',
      content: '',
      editable: !0,
      placeholderText: '请输入员工姓名（用户名）',
      success: function (n) {
        if (n.confirm && n.content) {
          var s,
            a = n.content.trim();
          if (a)
            wx.showModal({
              title: '设置密码',
              content: '',
              editable: !0,
              placeholderText: '留空则使用默认密码 111111',
              success:
                ((s = t(
                  e().mark(function t(n) {
                    var s, o;
                    return e().wrap(
                      function (e) {
                        for (;;)
                          switch ((e.prev = e.next)) {
                            case 0:
                              return (
                                (s =
                                  (n.content || '111111').trim() || '111111'),
                                wx.showLoading({ title: '添加中...' }),
                                (e.prev = 2),
                                (e.next = 5),
                                wx.cloud.callFunction({
                                  name: 'userManage',
                                  data: {
                                    userId: wx.getStorageSync('userId'),
                                    sessionToken:
                                      wx.getStorageSync('sessionToken'),
                                    action: 'add',
                                    username: a,
                                    name: a,
                                    password: md5(s + CLIENT_SALT),
                                  },
                                })
                              );
                            case 5:
                              if (
                                ((o = e.sent),
                                wx.hideLoading(),
                                !o.result || !o.result.success)
                              ) {
                                e.next = 11;
                                break;
                              }
                              return (
                                wx.showToast({ title: '添加成功' }),
                                r.loadUsers(),
                                e.abrupt('return')
                              );
                            case 11:
                              wx.showToast({
                                title:
                                  (o.result && o.result.message) || '添加失败',
                                icon: 'none',
                              }),
                                (e.next = 19);
                              break;
                            case 14:
                              (e.prev = 14),
                                (e.t0 = e.catch(2)),
                                wx.hideLoading(),
                                console.error('添加员工失败', e.t0),
                                wx.showToast({
                                  title: '添加失败',
                                  icon: 'none',
                                });
                            case 19:
                            case 'end':
                              return e.stop();
                          }
                      },
                      t,
                      null,
                      [[2, 14]],
                    );
                  }),
                )),
                function (e) {
                  return s.apply(this, arguments);
                }),
            });
        }
      },
    });
  },
  deleteUser: function (r) {
    var n,
      s = this,
      a = r.currentTarget.dataset.id,
      o = r.currentTarget.dataset.name;
    wx.showModal({
      title: '删除员工',
      content: '确定删除员工“'.concat(
        o,
        '”吗？该账号的借货、销售、库存和调货记录也会一起删除。',
      ),
      success:
        ((n = t(
          e().mark(function t(r) {
            var n;
            return e().wrap(
              function (e) {
                for (;;)
                  switch ((e.prev = e.next)) {
                    case 0:
                      if (r.confirm) {
                        e.next = 2;
                        break;
                      }
                      return e.abrupt('return');
                    case 2:
                      return (
                        wx.showLoading({ title: '删除中...' }),
                        (e.prev = 3),
                        (e.next = 6),
                        wx.cloud.callFunction({
                          name: 'userManage',
                          data: {
                            userId: wx.getStorageSync('userId'),
                            sessionToken: wx.getStorageSync('sessionToken'),
                            action: 'delete',
                            targetUserId: a,
                          },
                        })
                      );
                    case 6:
                      if (
                        ((n = e.sent),
                        wx.hideLoading(),
                        !n.result || !n.result.success)
                      ) {
                        e.next = 12;
                        break;
                      }
                      return (
                        wx.showToast({ title: '已删除' }),
                        s.loadUsers(),
                        e.abrupt('return')
                      );
                    case 12:
                      wx.showToast({
                        title: (n.result && n.result.message) || '删除失败',
                        icon: 'none',
                      }),
                        (e.next = 20);
                      break;
                    case 15:
                      (e.prev = 15),
                        (e.t0 = e.catch(3)),
                        wx.hideLoading(),
                        console.error('删除员工失败', e.t0),
                        wx.showToast({ title: '删除失败', icon: 'none' });
                    case 20:
                    case 'end':
                      return e.stop();
                  }
              },
              t,
              null,
              [[3, 15]],
            );
          }),
        )),
        function (e) {
          return n.apply(this, arguments);
        }),
    });
  },
  resetPassword: function (r) {
    var n,
      s = r.currentTarget.dataset.id;
    wx.showModal({
      title: '重置密码',
      content: '',
      editable: !0,
      placeholderText: '请输入新密码',
      success:
        ((n = t(
          e().mark(function t(r) {
            var n, a;
            return e().wrap(
              function (e) {
                for (;;)
                  switch ((e.prev = e.next)) {
                    case 0:
                      if (r.confirm && r.content) {
                        e.next = 2;
                        break;
                      }
                      return e.abrupt('return');
                    case 2:
                      if (!((n = r.content.trim()).length < 6)) {
                        e.next = 6;
                        break;
                      }
                      return (
                        wx.showToast({ title: '密码至少 6 位', icon: 'none' }),
                        e.abrupt('return')
                      );
                    case 6:
                      return (
                        wx.showLoading({ title: '处理中...' }),
                        (e.prev = 7),
                        (e.next = 10),
                        wx.cloud.callFunction({
                          name: 'userManage',
                          data: {
                            userId: wx.getStorageSync('userId'),
                            sessionToken: wx.getStorageSync('sessionToken'),
                            action: 'resetPassword',
                            targetUserId: s,
                            newPassword: md5(n + CLIENT_SALT),
                          },
                        })
                      );
                    case 10:
                      if (
                        ((a = e.sent),
                        wx.hideLoading(),
                        !a.result || !a.result.success)
                      ) {
                        e.next = 15;
                        break;
                      }
                      return (
                        wx.showToast({ title: '密码已重置' }),
                        e.abrupt('return')
                      );
                    case 15:
                      wx.showToast({
                        title: (a.result && a.result.message) || '操作失败',
                        icon: 'none',
                      }),
                        (e.next = 23);
                      break;
                    case 18:
                      (e.prev = 18),
                        (e.t0 = e.catch(7)),
                        wx.hideLoading(),
                        console.error('重置密码失败', e.t0),
                        wx.showToast({ title: '操作失败', icon: 'none' });
                    case 23:
                    case 'end':
                      return e.stop();
                  }
              },
              t,
              null,
              [[7, 18]],
            );
          }),
        )),
        function (e) {
          return n.apply(this, arguments);
        }),
    });
  },
});
