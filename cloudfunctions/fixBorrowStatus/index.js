var e = require('../../@babel/runtime/helpers/regeneratorRuntime'),
  r = require('../../@babel/runtime/helpers/createForOfIteratorHelper'),
  t = require('../../@babel/runtime/helpers/asyncToGenerator'),
  a = require('wx-server-sdk');
a.init({ env: a.DYNAMIC_CURRENT_ENV });
var n = a.database(),
  s = n.command;
exports.main = (function () {
  var a = t(
    e().mark(function t(a, c) {
      var u, o, i, l;
      return e().wrap(
        function (e) {
          for (;;)
            switch ((e.prev = e.next)) {
              case 0:
                return (
                  (e.prev = 0),
                  (e.next = 3),
                  n
                    .collection('borrow')
                    .where({ status: s.exists(!1) })
                    .get()
                );
              case 3:
                (u = e.sent),
                  console.log('找到', u.data.length, '条需要修复的记录'),
                  (o = r(u.data)),
                  (e.prev = 6),
                  o.s();
              case 8:
                if ((i = o.n()).done) {
                  e.next = 14;
                  break;
                }
                return (
                  (l = i.value),
                  (e.next = 12),
                  n
                    .collection('borrow')
                    .doc(l._id)
                    .update({ data: { status: 'pending' } })
                );
              case 12:
                e.next = 8;
                break;
              case 14:
                e.next = 19;
                break;
              case 16:
                (e.prev = 16), (e.t0 = e.catch(6)), o.e(e.t0);
              case 19:
                return (e.prev = 19), o.f(), e.finish(19);
              case 22:
                return e.abrupt('return', {
                  success: !0,
                  count: u.data.length,
                });
              case 25:
                return (
                  (e.prev = 25),
                  (e.t1 = e.catch(0)),
                  e.abrupt('return', { success: !1, error: e.t1.message })
                );
              case 28:
              case 'end':
                return e.stop();
            }
        },
        t,
        null,
        [
          [0, 25],
          [6, 16, 19, 22],
        ],
      );
    }),
  );
  return function (e, r) {
    return a.apply(this, arguments);
  };
})();
