var e = require('../../@babel/runtime/helpers/regeneratorRuntime'),
  r = require('../../@babel/runtime/helpers/asyncToGenerator'),
  t = require('wx-server-sdk'),
  s = require('crypto');
t.init({ env: t.DYNAMIC_CURRENT_ENV });
var n = t.database(),
  a = n.command;
function u(e, r) {
  return s
    .createHash('sha256')
    .update(e + r)
    .digest('hex');
}
function c() {
  return s.randomBytes(16).toString('hex');
}
function o() {
  return s.randomBytes(32).toString('hex');
}
function i(e) {
  return p.apply(this, arguments);
}
function p() {
  return (p = r(
    e().mark(function r(t) {
      var s, a;
      return e().wrap(function (e) {
        for (;;)
          switch ((e.prev = e.next)) {
            case 0:
              return (
                (s = o()),
                (a = new Date(Date.now() + 2592e6)),
                (e.next = 4),
                n
                  .collection('users')
                  .doc(t)
                  .update({ data: { sessionToken: s, sessionExpireAt: a } })
              );
            case 4:
              return e.abrupt('return', s);
            case 5:
            case 'end':
              return e.stop();
          }
      }, r);
    }),
  )).apply(this, arguments);
}
function d(e, r) {
  return l.apply(this, arguments);
}
function l() {
  return (l = r(
    e().mark(function r(t, s) {
      var a, u, c;
      return e().wrap(function (e) {
        for (;;)
          switch ((e.prev = e.next)) {
            case 0:
              if (t && s) {
                e.next = 2;
                break;
              }
              throw new Error('登录状态已失效，请重新登录');
            case 2:
              return (e.next = 4), n.collection('users').doc(t).get();
            case 4:
              if (((a = e.sent), (u = a.data))) {
                e.next = 8;
                break;
              }
              throw new Error('用户不存在');
            case 8:
              if (u.sessionToken === s) {
                e.next = 10;
                break;
              }
              throw new Error('登录状态已失效，请重新登录');
            case 10:
              if (
                (c = u.sessionExpireAt
                  ? new Date(u.sessionExpireAt).getTime()
                  : 0) &&
                !(c <= Date.now())
              ) {
                e.next = 13;
                break;
              }
              throw new Error('登录已过期，请重新登录');
            case 13:
              return (
                (e.next = 15),
                n
                  .collection('users')
                  .doc(t)
                  .update({
                    data: { sessionExpireAt: new Date(Date.now() + 2592e6) },
                  })
              );
            case 15:
              return e.abrupt('return', u);
            case 16:
            case 'end':
              return e.stop();
          }
      }, r);
    }),
  )).apply(this, arguments);
}
function f(e, r) {
  return x.apply(this, arguments);
}
function x() {
  return (x = r(
    e().mark(function r(t, s) {
      var a;
      return e().wrap(function (e) {
        for (;;)
          switch ((e.prev = e.next)) {
            case 0:
              return (e.next = 2), n.collection(t).where(s).count();
            case 2:
              return (a = e.sent), e.abrupt('return', a.total || 0);
            case 4:
            case 'end':
              return e.stop();
          }
      }, r);
    }),
  )).apply(this, arguments);
}
function b(e, r) {
  return w.apply(this, arguments);
}
function w() {
  return (w = r(
    e().mark(function r(t, s) {
      var a;
      return e().wrap(function (e) {
        for (;;)
          switch ((e.prev = e.next)) {
            case 0:
              return (e.next = 2), f(t, s);
            case 2:
              if ((a = e.sent)) {
                e.next = 5;
                break;
              }
              return e.abrupt('return', 0);
            case 5:
              return (e.next = 7), n.collection(t).where(s).remove();
            case 7:
              return e.abrupt('return', a);
            case 8:
            case 'end':
              return e.stop();
          }
      }, r);
    }),
  )).apply(this, arguments);
}
function m(e) {
  return h.apply(this, arguments);
}
function h() {
  return (h = r(
    e().mark(function r(t) {
      return e().wrap(function (e) {
        for (;;)
          switch ((e.prev = e.next)) {
            case 0:
              return (e.next = 2), b('borrow', { borrowerId: t });
            case 2:
              return (e.t0 = e.sent), (e.next = 5), b('sale', { sellerId: t });
            case 5:
              return (
                (e.t1 = e.sent), (e.next = 8), b('user_goods', { userId: t })
              );
            case 8:
              return (
                (e.t2 = e.sent),
                (e.next = 11),
                b(
                  'transfer_requests',
                  a.or([{ senderId: t }, { receiverId: t }]),
                )
              );
            case 11:
              return (
                (e.t3 = e.sent),
                e.abrupt('return', {
                  borrow: e.t0,
                  sale: e.t1,
                  userGoods: e.t2,
                  transferRequests: e.t3,
                })
              );
            case 13:
            case 'end':
              return e.stop();
          }
      }, r);
    }),
  )).apply(this, arguments);
}
exports.main = (function () {
  var t = r(
    e().mark(function r(t) {
      var s, a, o, p, l, f, x, b, w, h, k, g, v, y, E, D, I, T, q, A, P;
      return e().wrap(
        function (e) {
          for (;;)
            switch ((e.prev = e.next)) {
              case 0:
                return (
                  (s = t.userId),
                  (a = t.sessionToken),
                  (o = t.action),
                  (p = t.targetUserId),
                  (l = t.newPassword),
                  (e.prev = 1),
                  (e.next = 4),
                  d(s, a)
                );
              case 4:
                if (((f = e.sent), 'changePassword' !== o)) {
                  e.next = 23;
                  break;
                }
                if ((x = t.oldPassword) && l) {
                  e.next = 9;
                  break;
                }
                return e.abrupt('return', {
                  success: !1,
                  message: '参数不完整',
                });
              case 9:
                if (
                  ((b = f.password),
                  (w = f.salt || ''),
                  (h = u(x, w)),
                  (k = h === b) || f.salt || x !== b || (k = !0),
                  k)
                ) {
                  e.next = 16;
                  break;
                }
                return e.abrupt('return', {
                  success: !1,
                  message: '当前密码错误',
                });
              case 16:
                return (
                  (g = c()),
                  (e.next = 19),
                  n
                    .collection('users')
                    .doc(s)
                    .update({ data: { password: u(l, g), salt: g } })
                );
              case 19:
                return (e.next = 21), i(s);
              case 21:
                return (
                  (v = e.sent),
                  e.abrupt('return', {
                    success: !0,
                    message: '密码修改成功',
                    sessionToken: v,
                  })
                );
              case 23:
                if ('root' === f.role) {
                  e.next = 25;
                  break;
                }
                return e.abrupt('return', { success: !1, message: '无权限' });
              case 25:
                if ('delete' !== o) {
                  e.next = 44;
                  break;
                }
                if (p) {
                  e.next = 28;
                  break;
                }
                return e.abrupt('return', {
                  success: !1,
                  message: '缺少目标用户',
                });
              case 28:
                if (p !== s) {
                  e.next = 30;
                  break;
                }
                return e.abrupt('return', {
                  success: !1,
                  message: '不能删除当前登录账号',
                });
              case 30:
                return (e.next = 32), n.collection('users').doc(p).get();
              case 32:
                if (((y = e.sent), (E = y.data))) {
                  e.next = 36;
                  break;
                }
                return e.abrupt('return', {
                  success: !1,
                  message: '目标用户不存在',
                });
              case 36:
                if ('root' !== E.role) {
                  e.next = 38;
                  break;
                }
                return e.abrupt('return', {
                  success: !1,
                  message: '不能删除管理员账号',
                });
              case 38:
                return (e.next = 40), m(p);
              case 40:
                return (
                  (D = e.sent),
                  (e.next = 43),
                  n.collection('users').doc(p).remove()
                );
              case 43:
                return e.abrupt('return', {
                  success: !0,
                  message: '删除成功',
                  deleted: D,
                });
              case 44:
                if ('resetPassword' !== o) {
                  e.next = 51;
                  break;
                }
                if (l && !(l.length < 6)) {
                  e.next = 47;
                  break;
                }
                return e.abrupt('return', {
                  success: !1,
                  message: '密码至少 6 位',
                });
              case 47:
                return (
                  (I = c()),
                  (e.next = 50),
                  n
                    .collection('users')
                    .doc(p)
                    .update({ data: { password: u(l, I), salt: I } })
                );
              case 50:
                return e.abrupt('return', {
                  success: !0,
                  message: '密码已重置',
                });
              case 51:
                if ('add' !== o) {
                  e.next = 66;
                  break;
                }
                if (
                  ((T = t.username), (q = t.name), (A = t.password), T && A)
                ) {
                  e.next = 55;
                  break;
                }
                return e.abrupt('return', {
                  success: !1,
                  message: '用户名和密码不能为空',
                });
              case 55:
                if (!(A.length < 6)) {
                  e.next = 57;
                  break;
                }
                return e.abrupt('return', {
                  success: !1,
                  message: '密码至少 6 位',
                });
              case 57:
                return (
                  (e.next = 59),
                  n.collection('users').where({ username: T }).count()
                );
              case 59:
                if (!(e.sent.total > 0)) {
                  e.next = 62;
                  break;
                }
                return e.abrupt('return', {
                  success: !1,
                  message: '用户名已存在',
                });
              case 62:
                return (
                  (P = c()),
                  (e.next = 65),
                  n
                    .collection('users')
                    .add({
                      data: {
                        username: T,
                        name: q || T,
                        password: u(A, P),
                        salt: P,
                        role: 'staff',
                        createTime: n.serverDate(),
                      },
                    })
                );
              case 65:
                return e.abrupt('return', { success: !0, message: '添加成功' });
              case 66:
                return e.abrupt('return', { success: !1, message: '未知操作' });
              case 69:
                return (
                  (e.prev = 69),
                  (e.t0 = e.catch(1)),
                  e.abrupt('return', {
                    success: !1,
                    message: e.t0.message || '操作失败',
                  })
                );
              case 72:
              case 'end':
                return e.stop();
            }
        },
        r,
        null,
        [[1, 69]],
      );
    }),
  );
  return function (e) {
    return t.apply(this, arguments);
  };
})();
