var e = require('@babel/runtime/helpers/regeneratorRuntime'),
  r = require('@babel/runtime/helpers/asyncToGenerator'),
  t = require('wx-server-sdk');
t.init({ env: t.DYNAMIC_CURRENT_ENV });
var n = t.database();
function a(e, r) {
  return o.apply(this, arguments);
}
function o() {
  return (o = r(
    e().mark(function r(t, a) {
      var o, c, s, i, u, p, l;
      return e().wrap(function (e) {
        for (;;)
          switch ((e.prev = e.next)) {
            case 0:
              if ((o = t.match(/借货\s+(.+?)(\d+)([米个台]?)/))) {
                e.next = 3;
                break;
              }
              return e.abrupt('return', '格式不对');
            case 3:
              return (
                (c = o[1].trim()),
                (s = parseFloat(o[2])),
                (i = o[3] || ''),
                (e.next = 8),
                n
                  .collection('goods')
                  .where({ name: n.RegExp({ regexp: c, options: 'i' }) })
                  .get()
              );
            case 8:
              if (0 !== (u = e.sent).data.length) {
                e.next = 11;
                break;
              }
              return e.abrupt('return', '未找到商品: '.concat(c));
            case 11:
              return (
                (p = u.data[0]),
                (l = new Date().toISOString().split('T')[0]),
                (e.next = 15),
                n
                  .collection('borrow')
                  .add({
                    data: {
                      goodsId: p._id,
                      goodsName: p.name,
                      unit: p.unit || i,
                      costPrice: p.costPrice,
                      quantity: s,
                      borrowDate: l,
                      borrowerId: a,
                      createTime: n.serverDate(),
                    },
                  })
              );
            case 15:
              return e.abrupt(
                'return',
                '借货成功: '.concat(p.name, ' x ').concat(s),
              );
            case 16:
            case 'end':
              return e.stop();
          }
      }, r);
    }),
  )).apply(this, arguments);
}
function c() {
  return (c = r(
    e().mark(function r() {
      var t;
      return e().wrap(
        function (e) {
          for (;;)
            switch ((e.prev = e.next)) {
              case 0:
                return (
                  (e.prev = 0), (e.next = 3), a('借货 彩钢1150xk 1个', '王钒宇')
                );
              case 3:
                (t = e.sent), console.log(t), (e.next = 10);
                break;
              case 7:
                (e.prev = 7), (e.t0 = e.catch(0)), console.error(e.t0);
              case 10:
              case 'end':
                return e.stop();
            }
        },
        r,
        null,
        [[0, 7]],
      );
    }),
  )).apply(this, arguments);
}
!(function () {
  c.apply(this, arguments);
})();
