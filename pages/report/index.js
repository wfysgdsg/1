require('../../@babel/runtime/helpers/Objectvalues');
var t = require('../../@babel/runtime/helpers/regeneratorRuntime'),
  e = require('../../@babel/runtime/helpers/objectSpread2'),
  o = require('../../@babel/runtime/helpers/slicedToArray'),
  a = require('../../@babel/runtime/helpers/asyncToGenerator'),
  r = wx.cloud.database();
Page({
  data: {
    filterMonth: '',
    totalAmount: 0,
    totalCost: 0,
    totalProfit: 0,
    goodsSummary: [],
    customerSummary: [],
    staffSummary: [],
    uiText: {
      thisMonth: '本月',
      summary: '销售汇总',
      totalAmount: '销售总额',
      totalCost: '总成本',
      totalProfit: '总毛利',
      byGoods: '按商品汇总',
      byCustomer: '按客户汇总',
      byStaff: '按人员汇总',
      goods: '商品',
      quantity: '数量',
      amount: '销售额',
      profit: '毛利',
      customer: '客户',
      count: '次数',
      staff: '人员',
    },
  },
  onShow: function () {
    wx.getStorageSync('userInfo')
      ? (this.setFilterMonth(), this.loadReport())
      : wx.redirectTo({ url: '/pages/login/login' });
  },
  setFilterMonth: function () {
    var t = new Date();
    this.setData({
      filterMonth: ''
        .concat(t.getFullYear(), '-')
        .concat(String(t.getMonth() + 1).padStart(2, '0')),
    });
  },
  onMonthChange: function (t) {
    this.setData({ filterMonth: t.detail.value }), this.loadReport();
  },
  loadReport: function () {
    var n = this;
    return a(
      t().mark(function a() {
        var i, u, s, m, l, c, f, d, h, g, p, b, y, x, S, w, N, v, q;
        return t().wrap(
          function (t) {
            for (;;)
              switch ((t.prev = t.next)) {
                case 0:
                  return (
                    (i = wx.getStorageSync('userInfo')),
                    (u = n.data.filterMonth.split('-')),
                    (s = o(u, 2)),
                    (m = s[0]),
                    (l = s[1]),
                    (c = new Date(m, l - 1, 1).getTime()),
                    (f = new Date(m, l, 1).getTime()),
                    (t.prev = 4),
                    (d = r
                      .collection('sale')
                      .where({
                        saleTime: r.command.gte(c).and(r.command.lt(f)),
                      })),
                    'root' !== i.role &&
                      (d = r
                        .collection('sale')
                        .where({
                          saleTime: r.command.gte(c).and(r.command.lt(f)),
                          sellerId: i._id,
                        })),
                    (t.next = 9),
                    d.get()
                  );
                case 9:
                  return (
                    (h = t.sent),
                    (g = h.data || []),
                    (p = 0),
                    (b = 0),
                    (y = 0),
                    (x = {}),
                    (S = {}),
                    (w = {}),
                    (t.next = 19),
                    r.collection('users').get()
                  );
                case 19:
                  (N = t.sent),
                    (v = {}),
                    (N.data || []).forEach(function (t) {
                      v[t._id] = t.name || t.username;
                    }),
                    g.forEach(function (t) {
                      (p += t.totalAmount || 0),
                        (b += t.totalCost || 0),
                        (y += t.totalProfit || 0),
                        (t.goodsDetail || []).forEach(function (t) {
                          x[t.goodsName] ||
                            (x[t.goodsName] = {
                              name: t.goodsName,
                              quantity: 0,
                              amount: 0,
                              profit: 0,
                            }),
                            (x[t.goodsName].quantity += t.quantity || 0),
                            (x[t.goodsName].amount +=
                              (t.salePrice || 0) * (t.quantity || 0)),
                            (x[t.goodsName].profit += t.profit || 0);
                        });
                      var e = t.contactName || t.locationName || '未知';
                      S[e] ||
                        (S[e] = { name: e, count: 0, amount: 0, profit: 0 }),
                        (S[e].count += 1),
                        (S[e].amount += t.totalAmount || 0),
                        (S[e].profit += t.totalProfit || 0);
                      var o = v[t.sellerId] || '未知';
                      w[o] ||
                        (w[o] = { name: o, count: 0, amount: 0, profit: 0 }),
                        (w[o].count += 1),
                        (w[o].amount += t.totalAmount || 0),
                        (w[o].profit += t.totalProfit || 0);
                    }),
                    (q = function (t) {
                      return Object.values(t)
                        .sort(function (t, e) {
                          return e.amount - t.amount;
                        })
                        .slice(0, 10)
                        .map(function (t) {
                          return e(
                            e({}, t),
                            {},
                            {
                              amount: Number(t.amount || 0).toFixed(2),
                              profit: Number(t.profit || 0).toFixed(2),
                            },
                          );
                        });
                    }),
                    n.setData({
                      totalAmount: Number(p || 0).toFixed(2),
                      totalCost: Number(b || 0).toFixed(2),
                      totalProfit: Number(y || 0).toFixed(2),
                      goodsSummary: q(x),
                      customerSummary: q(S),
                      staffSummary: q(w),
                    }),
                    (t.next = 31);
                  break;
                case 27:
                  (t.prev = 27),
                    (t.t0 = t.catch(4)),
                    console.error('加载报表失败', t.t0),
                    wx.showToast({ title: '加载报表失败', icon: 'none' });
                case 31:
                case 'end':
                  return t.stop();
              }
          },
          a,
          null,
          [[4, 27]],
        );
      }),
    )();
  },
});
