require('../../@babel/runtime/helpers/Objectvalues');
var e = require('../../@babel/runtime/helpers/regeneratorRuntime'),
  t = require('../../@babel/runtime/helpers/objectSpread2'),
  r = require('../../@babel/runtime/helpers/asyncToGenerator'),
  a = wx.cloud.database(),
  n = require('../../utils/db').fetchAll;
function o(e) {
  return i.apply(this, arguments);
}
function i() {
  return (i = r(
    e().mark(function t(r) {
      return e().wrap(function (e) {
        for (;;)
          switch ((e.prev = e.next)) {
            case 0:
              return (
                (e.next = 2),
                a
                  .collection('sale')
                  .doc(r)
                  .update({
                    data: { payStatus: 'paid', payTime: a.serverDate() },
                  })
              );
            case 2:
            case 'end':
              return e.stop();
          }
      }, t);
    }),
  )).apply(this, arguments);
}
Page({
  data: {
    debtList: [],
    totalDebt: '0.00',
    debtCount: 0,
    customerCount: 0,
    expandedId: '',
    uiText: {
      totalDebt: '待回收总额',
      unpaidOrders: '笔未结订单',
      customers: '个欠款单位',
      orderCount: '笔单子',
      profit: '利',
      overdue: '已欠款',
      days: '天',
      originalPrice: '原价',
      grossProfit: '毛利',
      goodsName: '商品名称',
      quantity: '数量',
      unitPrice: '单价',
      totalPrice: '总价',
      confirmPayment: '确认收款',
      noDebt: '目前没有欠款，账目全清。',
    },
  },
  onShow: function () {
    this.loadDebts();
  },
  loadDebts: function () {
    var o = this;
    return r(
      e().mark(function r() {
        var i, s, c, u, l, d;
        return e().wrap(
          function (e) {
            for (;;)
              switch ((e.prev = e.next)) {
                case 0:
                  return (
                    wx.showLoading({ title: '统计中...' }),
                    (i = wx.getStorageSync('userInfo')),
                    (e.prev = 2),
                    (s = a.collection('sale').where({ payStatus: 'unpaid' })),
                    'root' !== i.role && (s = s.where({ sellerId: i._id })),
                    (e.next = 7),
                    n(s.orderBy('saleTime', 'desc'))
                  );
                case 7:
                  (c = e.sent),
                    (u = {}),
                    (l = 0),
                    c.forEach(function (e) {
                      var t = e.contactId || e.locationId || 'unknown',
                        r = e.contactName || e.locationName || '未填写客户',
                        a = new Date(e.saleDate),
                        n = new Date();
                      (e.debtDays = Math.ceil(Math.abs(n - a) / 864e5)),
                        u[t] ||
                          (u[t] = {
                            contactId: t,
                            contactName: r,
                            totalOriginal: 0,
                            totalProfit: 0,
                            orders: [],
                          });
                      var o = 0,
                        i = [];
                      Array.isArray(e.goodsDetail) &&
                        e.goodsDetail.forEach(function (e) {
                          var t = Number(e.quantity || 0),
                            r = Number(e.salePrice || 0),
                            a = t * r,
                            n = Number(e.profit || 0);
                          (o += a),
                            i.push({
                              goodsName: e.goodsName || '未命名商品',
                              quantity: Number.isInteger(t) ? t : t.toFixed(2),
                              unit: e.unit || '',
                              salePrice: r.toFixed(2),
                              lineTotal: a.toFixed(2),
                              profit: n.toFixed(2),
                            });
                        }),
                        (e.goodsRows = i),
                        (e.orderOriginal = o.toFixed(2)),
                        (e.orderProfit = parseFloat(e.totalProfit || 0).toFixed(
                          2,
                        )),
                        (u[t].totalOriginal += o),
                        (u[t].totalProfit += parseFloat(e.totalProfit || 0)),
                        u[t].orders.push(e),
                        (l += o);
                    }),
                    (d = Object.values(u)
                      .map(function (e) {
                        return t(
                          t({}, e),
                          {},
                          {
                            displayOriginal: e.totalOriginal.toFixed(2),
                            displayProfit: e.totalProfit.toFixed(2),
                          },
                        );
                      })
                      .sort(function (e, t) {
                        return t.totalOriginal - e.totalOriginal;
                      })),
                    o.setData({
                      debtList: d,
                      totalDebt: l.toFixed(2),
                      debtCount: c.length,
                      customerCount: d.length,
                    }),
                    wx.hideLoading(),
                    (e.next = 21);
                  break;
                case 16:
                  (e.prev = 16),
                    (e.t0 = e.catch(2)),
                    wx.hideLoading(),
                    console.error('加载债务失败', e.t0),
                    wx.showToast({ title: '加载失败', icon: 'none' });
                case 21:
                case 'end':
                  return e.stop();
              }
          },
          r,
          null,
          [[2, 16]],
        );
      }),
    )();
  },
  toggleCustomer: function (e) {
    var t = e.currentTarget.dataset.id;
    this.setData({ expandedId: this.data.expandedId === t ? '' : t });
  },
  confirmPayment: function (t) {
    var a = this;
    return r(
      e().mark(function n() {
        var i, s, c;
        return e().wrap(function (n) {
          for (;;)
            switch ((n.prev = n.next)) {
              case 0:
                (i = t.currentTarget.dataset.id),
                  (s = wx.getStorageSync('userInfo')),
                  (c = wx.getStorageSync('sessionToken')),
                  wx.showModal({
                    title: '确认收款',
                    content: '确定这笔订单已经收到货款吗？',
                    success: (function () {
                      var t = r(
                        e().mark(function t(r) {
                          var n, u;
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
                                      wx.showLoading({ title: '处理中...' }),
                                      (e.prev = 3),
                                      (n = !1),
                                      (e.prev = 5),
                                      (e.next = 8),
                                      wx.cloud.callFunction({
                                        name: 'saleManage',
                                        data: {
                                          action: 'confirmPayment',
                                          userId: s ? s._id : '',
                                          sessionToken: c,
                                          saleId: i,
                                        },
                                      })
                                    );
                                  case 8:
                                    (u = e.sent),
                                      (n = !(!u.result || !u.result.success)),
                                      (e.next = 15);
                                    break;
                                  case 12:
                                    (e.prev = 12),
                                      (e.t0 = e.catch(5)),
                                      (n = !1);
                                  case 15:
                                    if (n) {
                                      e.next = 18;
                                      break;
                                    }
                                    return (e.next = 18), o(i);
                                  case 18:
                                    wx.hideLoading(),
                                      wx.showToast({ title: '销账成功' }),
                                      a.loadDebts(),
                                      (e.next = 28);
                                    break;
                                  case 23:
                                    (e.prev = 23),
                                      (e.t1 = e.catch(3)),
                                      wx.hideLoading(),
                                      console.error('销账失败', e.t1),
                                      wx.showToast({
                                        title: '操作失败',
                                        icon: 'none',
                                      });
                                  case 28:
                                  case 'end':
                                    return e.stop();
                                }
                            },
                            t,
                            null,
                            [
                              [3, 23],
                              [5, 12],
                            ],
                          );
                        }),
                      );
                      return function (e) {
                        return t.apply(this, arguments);
                      };
                    })(),
                  });
              case 4:
              case 'end':
                return n.stop();
            }
        }, n);
      }),
    )();
  },
});
