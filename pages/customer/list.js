var e = require('../../@babel/runtime/helpers/regeneratorRuntime'),
  t = require('../../@babel/runtime/helpers/asyncToGenerator'),
  r = wx.cloud.database();
Page({
  data: { customerList: [], searchKeyword: '' },
  onShow: function () {
    this.loadCustomers();
  },
  loadCustomers: function () {
    var a = this;
    return t(
      e().mark(function t() {
        var n, o;
        return e().wrap(
          function (e) {
            for (;;)
              switch ((e.prev = e.next)) {
                case 0:
                  return (
                    (e.prev = 0),
                    (n = r
                      .collection('customer')
                      .orderBy('createTime', 'desc')),
                    a.data.searchKeyword &&
                      (n = n.where({
                        name: r.RegExp({
                          regexp: a.data.searchKeyword,
                          options: 'i',
                        }),
                      })),
                    (e.next = 5),
                    n.get()
                  );
                case 5:
                  (o = e.sent),
                    a.setData({ customerList: o.data }),
                    (e.next = 12);
                  break;
                case 9:
                  (e.prev = 9),
                    (e.t0 = e.catch(0)),
                    console.error('加载送货单位失败', e.t0);
                case 12:
                case 'end':
                  return e.stop();
              }
          },
          t,
          null,
          [[0, 9]],
        );
      }),
    )();
  },
  onSearch: function (e) {
    this.setData({ searchKeyword: e.detail.value }), this.loadCustomers();
  },
  goToAdd: function () {
    wx.navigateTo({ url: '/pages/customer/add' });
  },
  editCustomer: function (e) {
    var t = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/customer/add?id='.concat(t) });
  },
  deleteCustomer: function (a) {
    var n = this;
    return t(
      e().mark(function o() {
        var s;
        return e().wrap(function (o) {
          for (;;)
            switch ((o.prev = o.next)) {
              case 0:
                (s = a.currentTarget.dataset.id),
                  wx.showModal({
                    title: '确认删除',
                    content: '确定要删除该送货单位吗？',
                    success: (function () {
                      var a = t(
                        e().mark(function t(a) {
                          return e().wrap(
                            function (e) {
                              for (;;)
                                switch ((e.prev = e.next)) {
                                  case 0:
                                    if (!a.confirm) {
                                      e.next = 12;
                                      break;
                                    }
                                    return (
                                      (e.prev = 1),
                                      (e.next = 4),
                                      r.collection('customer').doc(s).remove()
                                    );
                                  case 4:
                                    wx.showToast({ title: '删除成功' }),
                                      n.loadCustomers(),
                                      (e.next = 12);
                                    break;
                                  case 8:
                                    (e.prev = 8),
                                      (e.t0 = e.catch(1)),
                                      console.error('删除失败', e.t0),
                                      wx.showToast({
                                        title: '删除失败',
                                        icon: 'none',
                                      });
                                  case 12:
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
                      return function (e) {
                        return a.apply(this, arguments);
                      };
                    })(),
                  });
              case 2:
              case 'end':
                return o.stop();
            }
        }, o);
      }),
    )();
  },
});
