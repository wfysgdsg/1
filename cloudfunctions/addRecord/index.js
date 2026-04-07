var e = require('../../@babel/runtime/helpers/regeneratorRuntime'),
  t = require('../../@babel/runtime/helpers/asyncToGenerator'),
  r = require('wx-server-sdk');
r.init({ env: r.DYNAMIC_CURRENT_ENV });
var a = r.database();
exports.main = (function () {
  var r = t(
    e().mark(function t(r, s) {
      var n, c, o, u, i, l, m, p, d, g, b, x, f, v, w, h, P, k, D;
      return e().wrap(
        function (e) {
          for (;;)
            switch ((e.prev = e.next)) {
              case 0:
                return (
                  (n = r.type),
                  (c = r.goodsName),
                  (o = r.quantity),
                  (u = r.customerName),
                  (i = r.salePrice),
                  (l = r.costPrice),
                  (m = r.date),
                  (e.prev = 1),
                  (e.next = 4),
                  a
                    .collection('goods')
                    .where({ name: a.RegExp({ regexp: c, options: 'i' }) })
                    .get()
                );
              case 4:
                if (0 !== (p = e.sent).data.length) {
                  e.next = 7;
                  break;
                }
                return e.abrupt('return', {
                  success: !1,
                  message: '未找到商品: '.concat(c),
                });
              case 7:
                if (
                  ((d = p.data[0]),
                  (g = m || new Date().toISOString().split('T')[0]),
                  'borrow' !== n)
                ) {
                  e.next = 16;
                  break;
                }
                return (
                  (b = {
                    goodsId: d._id,
                    goodsName: d.name,
                    unit: d.unit || '',
                    costPrice: d.costPrice,
                    quantity: parseFloat(o),
                    borrowDate: g,
                    remark: '',
                    status: 'pending',
                    createTime: a.serverDate(),
                  }),
                  (e.next = 13),
                  a.collection('borrow').add({ data: b })
                );
              case 13:
                return e.abrupt('return', {
                  success: !0,
                  message: '借货记录已添加：'
                    .concat(d.name, ' x ')
                    .concat(o)
                    .concat(d.unit || ''),
                });
              case 16:
                if ('sale' !== n) {
                  e.next = 35;
                  break;
                }
                if (u) {
                  e.next = 19;
                  break;
                }
                return e.abrupt('return', {
                  success: !1,
                  message: '销售记录需要提供送货单位',
                });
              case 19:
                return (
                  (e.next = 21),
                  a
                    .collection('customer')
                    .where({ name: a.RegExp({ regexp: u, options: 'i' }) })
                    .get()
                );
              case 21:
                return (
                  (x = e.sent),
                  (f = ''),
                  (v = u),
                  x.data.length > 0 &&
                    ((f = x.data[0]._id), (v = x.data[0].name)),
                  (w = i ? parseFloat(i) : d.salePrice),
                  (h = l ? parseFloat(l) : d.costPrice),
                  (P = parseFloat(o)),
                  (k = (w - h) * P),
                  (D = {
                    goodsDetail: [
                      {
                        goodsId: d._id,
                        goodsName: d.name,
                        unit: d.unit || '',
                        quantity: P,
                        salePrice: w,
                        costPrice: h,
                        profit: k,
                      },
                    ],
                    customerId: f,
                    customerName: v,
                    totalAmount: w * P,
                    totalCost: h * P,
                    totalProfit: k,
                    saleDate: g,
                    saleTime: new Date(g).getTime(),
                    createTime: a.serverDate(),
                  }),
                  (e.next = 32),
                  a.collection('sale').add({ data: D })
                );
              case 32:
                return e.abrupt('return', {
                  success: !0,
                  message: '销售记录已添加：'
                    .concat(d.name, ' x ')
                    .concat(o)
                    .concat(d.unit || '', ' -> ')
                    .concat(v),
                });
              case 35:
                return e.abrupt('return', {
                  success: !1,
                  message: '未知类型，请使用 borrow 或 sale',
                });
              case 36:
                e.next = 41;
                break;
              case 38:
                return (
                  (e.prev = 38),
                  (e.t0 = e.catch(1)),
                  e.abrupt('return', {
                    success: !1,
                    message: '添加失败: ' + e.t0.message,
                  })
                );
              case 41:
              case 'end':
                return e.stop();
            }
        },
        t,
        null,
        [[1, 38]],
      );
    }),
  );
  return function (e, t) {
    return r.apply(this, arguments);
  };
})();
