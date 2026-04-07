var e = require('../../@babel/runtime/helpers/regeneratorRuntime'),
  t = require('../../@babel/runtime/helpers/asyncToGenerator'),
  r = require('wx-server-sdk');
r.init({ env: r.DYNAMIC_CURRENT_ENV });
var n = r.database();
function a(e, t) {
  return c.apply(this, arguments);
}
function c() {
  return (c = t(
    e().mark(function t(r, n) {
      var a;
      return e().wrap(function (e) {
        for (;;)
          switch ((e.prev = e.next)) {
            case 0:
              if (!(a = r.trim()).startsWith('借货') && !a.startsWith('进货')) {
                e.next = 5;
                break;
              }
              return (e.next = 4), s(a, n);
            case 4:
              return e.abrupt('return', e.sent);
            case 5:
              if (!a.startsWith('销售') && !a.startsWith('卖')) {
                e.next = 9;
                break;
              }
              return (e.next = 8), u(a, n);
            case 8:
              return e.abrupt('return', e.sent);
            case 9:
              if (!a.startsWith('库存') && !a.startsWith('查询')) {
                e.next = 13;
                break;
              }
              return (e.next = 12), d(a, n);
            case 12:
              return e.abrupt('return', e.sent);
            case 13:
              return e.abrupt('return', null);
            case 14:
            case 'end':
              return e.stop();
          }
      }, t);
    }),
  )).apply(this, arguments);
}
function s(e, t) {
  return o.apply(this, arguments);
}
function o() {
  return (o = t(
    e().mark(function t(r, a) {
      var c, s, o, u, i, d, p, l;
      return e().wrap(function (e) {
        for (;;)
          switch ((e.prev = e.next)) {
            case 0:
              if ((c = r.match(/借货\s+(.+?)(\d+)([米个台]?)/))) {
                e.next = 3;
                break;
              }
              return e.abrupt(
                'return',
                '格式不对，请用: 借货 商品名 数量\n例如: 借货 彩钢1150xk 10米',
              );
            case 3:
              return (
                (s = c[1].trim()),
                (o = parseFloat(c[2])),
                (u = c[3] || ''),
                (e.next = 8),
                n
                  .collection('goods')
                  .where({ name: n.RegExp({ regexp: s, options: 'i' }) })
                  .get()
              );
            case 8:
              if (0 !== (i = e.sent).data.length) {
                e.next = 11;
                break;
              }
              return e.abrupt('return', '未找到商品: '.concat(s));
            case 11:
              return (
                (d = i.data[0]),
                (p = new Date().toISOString().split('T')[0]),
                (e.next = 15),
                n
                  .collection('borrow')
                  .add({
                    data: {
                      goodsId: d._id,
                      goodsName: d.name,
                      unit: d.unit || u,
                      costPrice: d.costPrice,
                      quantity: o,
                      borrowDate: p,
                      locationId: '',
                      locationName: '',
                      remark: 'QQ语音创建',
                      status: 'pending',
                      borrowerId: a,
                      createTime: n.serverDate(),
                    },
                  })
              );
            case 15:
              return (
                (e.next = 17),
                n
                  .collection('user_goods')
                  .where({ userId: a, goodsId: d._id })
                  .get()
              );
            case 17:
              if (!((l = e.sent).data.length > 0)) {
                e.next = 23;
                break;
              }
              return (
                (e.next = 21),
                n
                  .collection('user_goods')
                  .doc(l.data[0]._id)
                  .update({ data: { stock: n.command.inc(o) } })
              );
            case 21:
              e.next = 25;
              break;
            case 23:
              return (
                (e.next = 25),
                n
                  .collection('user_goods')
                  .add({
                    data: {
                      userId: a,
                      goodsId: d._id,
                      goodsName: d.name,
                      unit: d.unit || u,
                      stock: o,
                    },
                  })
              );
            case 25:
              return e.abrupt(
                'return',
                '✅ 借货成功！\n商品: '
                  .concat(d.name, '\n数量: ')
                  .concat(o)
                  .concat(d.unit || u, '\n库存已增加'),
              );
            case 26:
            case 'end':
              return e.stop();
          }
      }, t);
    }),
  )).apply(this, arguments);
}
function u(e, t) {
  return i.apply(this, arguments);
}
function i() {
  return (i = t(
    e().mark(function t(r, a) {
      var c, s, o, u, i, d, p, l, g, m, x, f, h, b, k;
      return e().wrap(function (e) {
        for (;;)
          switch ((e.prev = e.next)) {
            case 0:
              if (
                (c = r.match(/销售\s+(.+?)(\d+)([米个台]?)(?:给\s+(.+?))?$/))
              ) {
                e.next = 3;
                break;
              }
              return e.abrupt(
                'return',
                '格式不对，请用: 销售 商品名 数量 [给 公司名]\n例如: 销售 彩钢1150xk 5米 给 XX公司',
              );
            case 3:
              return (
                (s = c[1].trim()),
                (o = parseFloat(c[2])),
                (u = c[3] || ''),
                (i = c[4] ? c[4].trim() : ''),
                (e.next = 9),
                n
                  .collection('goods')
                  .where({ name: n.RegExp({ regexp: s, options: 'i' }) })
                  .get()
              );
            case 9:
              if (0 !== (d = e.sent).data.length) {
                e.next = 12;
                break;
              }
              return e.abrupt('return', '未找到商品: '.concat(s));
            case 12:
              return (
                (p = d.data[0]),
                (l = new Date().toISOString().split('T')[0]),
                (g = 0),
                (e.next = 17),
                n
                  .collection('user_goods')
                  .where({ userId: a, goodsId: p._id })
                  .get()
              );
            case 17:
              if (
                ((m = e.sent).data.length > 0 && (g = m.data[0].stock),
                !(g < o))
              ) {
                e.next = 21;
                break;
              }
              return e.abrupt(
                'return',
                '库存不足！当前库存: '
                  .concat(g)
                  .concat(p.unit || u, '\n需要: ')
                  .concat(o)
                  .concat(p.unit || u),
              );
            case 21:
              if (((x = ''), !i)) {
                e.next = 27;
                break;
              }
              return (
                (e.next = 25),
                n
                  .collection('customer')
                  .where({ name: n.RegExp({ regexp: i, options: 'i' }) })
                  .get()
              );
            case 25:
              (f = e.sent).data.length > 0 && (x = f.data[0]._id);
            case 27:
              return (
                (h = p.salePrice * o),
                (b = p.costPrice * o),
                (k = h - b),
                (e.next = 32),
                n
                  .collection('sale')
                  .add({
                    data: {
                      customerId: x,
                      customerName: i || '未指定',
                      goodsDetail: [
                        {
                          goodsId: p._id,
                          goodsName: p.name,
                          unit: p.unit || u,
                          quantity: o,
                          salePrice: p.salePrice,
                          costPrice: p.costPrice,
                          profit: k,
                        },
                      ],
                      totalAmount: h,
                      totalCost: b,
                      totalProfit: k,
                      saleDate: l,
                      saleTime: new Date(l).getTime(),
                      remark: 'QQ语音创建',
                      sellerId: a,
                      createTime: n.serverDate(),
                    },
                  })
              );
            case 32:
              return (
                (e.next = 34),
                n
                  .collection('user_goods')
                  .doc(m.data[0]._id)
                  .update({ data: { stock: n.command.inc(-o) } })
              );
            case 34:
              return e.abrupt(
                'return',
                '✅ 销售成功！\n商品: '
                  .concat(p.name, '\n数量: ')
                  .concat(o)
                  .concat(p.unit || u, '\n客户: ')
                  .concat(i || '未指定', '\n金额: ¥')
                  .concat(h, '\n毛利: ¥')
                  .concat(k),
              );
            case 35:
            case 'end':
              return e.stop();
          }
      }, t);
    }),
  )).apply(this, arguments);
}
function d(e, t) {
  return p.apply(this, arguments);
}
function p() {
  return (p = t(
    e().mark(function t(r, a) {
      var c, s, o, u, i;
      return e().wrap(function (e) {
        for (;;)
          switch ((e.prev = e.next)) {
            case 0:
              if ((c = r.replace(/库存|查询/g, '').trim())) {
                e.next = 10;
                break;
              }
              return (
                (e.next = 4),
                n.collection('user_goods').where({ userId: a }).get()
              );
            case 4:
              if (0 !== (s = e.sent).data.length) {
                e.next = 7;
                break;
              }
              return e.abrupt('return', '暂无库存记录');
            case 7:
              return (
                (o = '📦 你的库存:\n'),
                s.data.forEach(function (e) {
                  o += ''
                    .concat(e.goodsName, ': ')
                    .concat(e.stock)
                    .concat(e.unit || '', '\n');
                }),
                e.abrupt('return', o)
              );
            case 10:
              return (
                (e.next = 12),
                n
                  .collection('user_goods')
                  .where({
                    userId: a,
                    goodsName: n.RegExp({ regexp: c, options: 'i' }),
                  })
                  .get()
              );
            case 12:
              if (0 !== (u = e.sent).data.length) {
                e.next = 15;
                break;
              }
              return e.abrupt('return', '未找到商品: '.concat(c));
            case 15:
              return (
                (i = u.data[0]),
                e.abrupt(
                  'return',
                  '📦 '
                    .concat(i.goodsName, ': ')
                    .concat(i.stock)
                    .concat(i.unit || ''),
                )
              );
            case 17:
            case 'end':
              return e.stop();
          }
      }, t);
    }),
  )).apply(this, arguments);
}
exports.main = (function () {
  var r = t(
    e().mark(function t(r, n) {
      var c, s, o;
      return e().wrap(
        function (e) {
          for (;;)
            switch ((e.prev = e.next)) {
              case 0:
                return (
                  (c = r.message),
                  (s = r.senderId),
                  (e.prev = 1),
                  (e.next = 4),
                  a(c, s)
                );
              case 4:
                return (
                  (o = e.sent), e.abrupt('return', { success: !0, result: o })
                );
              case 8:
                return (
                  (e.prev = 8),
                  (e.t0 = e.catch(1)),
                  e.abrupt('return', { success: !1, error: e.t0.message })
                );
              case 11:
              case 'end':
                return e.stop();
            }
        },
        t,
        null,
        [[1, 8]],
      );
    }),
  );
  return function (e, t) {
    return r.apply(this, arguments);
  };
})();
