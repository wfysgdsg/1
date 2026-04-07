var e = require('../../@babel/runtime/helpers/createForOfIteratorHelper'),
  t = require('../../@babel/runtime/helpers/regeneratorRuntime'),
  r = require('../../@babel/runtime/helpers/asyncToGenerator'),
  a = wx.cloud.database(),
  n = a.command;
Page({
  data: { requestList: [], loading: !1 },
  onShow: function () {
    this.loadRequests();
  },
  onPullDownRefresh: function () {
    this.loadRequests();
  },
  loadRequests: function () {
    var e = this;
    return r(
      t().mark(function r() {
        var n, o;
        return t().wrap(
          function (t) {
            for (;;)
              switch ((t.prev = t.next)) {
                case 0:
                  return (
                    e.setData({ loading: !0 }),
                    (n = wx.getStorageSync('userInfo')),
                    (t.prev = 2),
                    (t.next = 5),
                    a
                      .collection('transfer_requests')
                      .where({ receiverId: n._id, status: 'pending' })
                      .orderBy('createTime', 'desc')
                      .get()
                  );
                case 5:
                  (o = t.sent),
                    e.setData({ requestList: o.data || [] }),
                    wx.stopPullDownRefresh(),
                    (t.next = 13);
                  break;
                case 10:
                  (t.prev = 10),
                    (t.t0 = t.catch(2)),
                    console.error('加载申请失败', t.t0);
                case 13:
                  return (
                    (t.prev = 13), e.setData({ loading: !1 }), t.finish(13)
                  );
                case 16:
                case 'end':
                  return t.stop();
              }
          },
          r,
          null,
          [[2, 10, 13, 16]],
        );
      }),
    )();
  },
  rejectTransfer: function (n) {
    var o = this;
    return r(
      t().mark(function s() {
        var c, i;
        return t().wrap(function (s) {
          for (;;)
            switch ((s.prev = s.next)) {
              case 0:
                (c = n.currentTarget.dataset.id),
                  (i = o.data.requestList.find(function (e) {
                    return e._id === c;
                  })),
                  wx.showModal({
                    title: '确认拒绝',
                    content: '确定要拒绝来自 '.concat(
                      i.senderName,
                      ' 的移货申请吗？',
                    ),
                    success: (function () {
                      var n = r(
                        t().mark(function r(n) {
                          var s, d, u;
                          return t().wrap(
                            function (t) {
                              for (;;)
                                switch ((t.prev = t.next)) {
                                  case 0:
                                    if (!n.confirm) {
                                      t.next = 32;
                                      break;
                                    }
                                    return (
                                      wx.showLoading({ title: '处理中...' }),
                                      (t.prev = 2),
                                      (t.next = 5),
                                      a
                                        .collection('transfer_requests')
                                        .doc(c)
                                        .update({
                                          data: { status: 'rejected' },
                                        })
                                    );
                                  case 5:
                                    (s = e(i.goodsList)), (t.prev = 6), s.s();
                                  case 8:
                                    if ((d = s.n()).done) {
                                      t.next = 14;
                                      break;
                                    }
                                    return (
                                      (u = d.value),
                                      (t.next = 12),
                                      a
                                        .collection('borrow')
                                        .doc(u.originalBorrowId)
                                        .update({ data: { status: 'pending' } })
                                    );
                                  case 12:
                                    t.next = 8;
                                    break;
                                  case 14:
                                    t.next = 19;
                                    break;
                                  case 16:
                                    (t.prev = 16),
                                      (t.t0 = t.catch(6)),
                                      s.e(t.t0);
                                  case 19:
                                    return (t.prev = 19), s.f(), t.finish(19);
                                  case 22:
                                    wx.showToast({ title: '已拒绝' }),
                                      o.loadRequests(),
                                      (t.next = 29);
                                    break;
                                  case 26:
                                    (t.prev = 26),
                                      (t.t1 = t.catch(2)),
                                      console.error('拒绝失败', t.t1);
                                  case 29:
                                    return (
                                      (t.prev = 29),
                                      wx.hideLoading(),
                                      t.finish(29)
                                    );
                                  case 32:
                                  case 'end':
                                    return t.stop();
                                }
                            },
                            r,
                            null,
                            [
                              [2, 26, 29, 32],
                              [6, 16, 19, 22],
                            ],
                          );
                        }),
                      );
                      return function (e) {
                        return n.apply(this, arguments);
                      };
                    })(),
                  });
              case 3:
              case 'end':
                return s.stop();
            }
        }, s);
      }),
    )();
  },
  acceptTransfer: function (o) {
    var s = this;
    return r(
      t().mark(function c() {
        var i, d, u;
        return t().wrap(function (c) {
          for (;;)
            switch ((c.prev = c.next)) {
              case 0:
                (i = o.currentTarget.dataset.id),
                  (d = s.data.requestList.find(function (e) {
                    return e._id === i;
                  })),
                  (u = wx.getStorageSync('userInfo')),
                  wx.showModal({
                    title: '确认接收',
                    content: '同意接收 '.concat(
                      d.senderName,
                      ' 移交给您的商品？',
                    ),
                    success: (function () {
                      var o = r(
                        t().mark(function r(o) {
                          var c, l, f, p, g;
                          return t().wrap(
                            function (t) {
                              for (;;)
                                switch ((t.prev = t.next)) {
                                  case 0:
                                    if (!o.confirm) {
                                      t.next = 50;
                                      break;
                                    }
                                    wx.showLoading({
                                      title: '正在办理移交...',
                                      mask: !0,
                                    }),
                                      (t.prev = 2),
                                      (c = e(d.goodsList)),
                                      (t.prev = 4),
                                      c.s();
                                  case 6:
                                    if ((l = c.n()).done) {
                                      t.next = 30;
                                      break;
                                    }
                                    return (
                                      (f = l.value),
                                      (t.next = 10),
                                      a
                                        .collection('borrow')
                                        .doc(f.originalBorrowId)
                                        .update({
                                          data: {
                                            status: 'returned',
                                            memo: '已移交给 '.concat(
                                              d.receiverName,
                                            ),
                                          },
                                        })
                                    );
                                  case 10:
                                    return (
                                      (t.next = 12),
                                      a
                                        .collection('borrow')
                                        .add({
                                          data: {
                                            borrowerId: u._id,
                                            borrowerName: u.name,
                                            goodsId: f.goodsId,
                                            goodsName: f.goodsName,
                                            quantity: f.quantity,
                                            unit: f.unit,
                                            costPrice: f.costPrice,
                                            salePrice: f.salePrice,
                                            borrowDate: new Date()
                                              .toISOString()
                                              .split('T')[0],
                                            locationId: '',
                                            locationName: d.fromCustomerName,
                                            status: 'pending',
                                            createTime: a.serverDate(),
                                          },
                                        })
                                    );
                                  case 12:
                                    return (
                                      (t.next = 14),
                                      a
                                        .collection('user_goods')
                                        .where({
                                          userId: d.senderId,
                                          goodsId: f.goodsId,
                                        })
                                        .get()
                                    );
                                  case 14:
                                    if (!((p = t.sent).data.length > 0)) {
                                      t.next = 18;
                                      break;
                                    }
                                    return (
                                      (t.next = 18),
                                      a
                                        .collection('user_goods')
                                        .doc(p.data[0]._id)
                                        .update({
                                          data: { stock: n.inc(-f.quantity) },
                                        })
                                    );
                                  case 18:
                                    return (
                                      (t.next = 20),
                                      a
                                        .collection('user_goods')
                                        .where({
                                          userId: u._id,
                                          goodsId: f.goodsId,
                                        })
                                        .get()
                                    );
                                  case 20:
                                    if (!((g = t.sent).data.length > 0)) {
                                      t.next = 26;
                                      break;
                                    }
                                    return (
                                      (t.next = 24),
                                      a
                                        .collection('user_goods')
                                        .doc(g.data[0]._id)
                                        .update({
                                          data: { stock: n.inc(f.quantity) },
                                        })
                                    );
                                  case 24:
                                    t.next = 28;
                                    break;
                                  case 26:
                                    return (
                                      (t.next = 28),
                                      a
                                        .collection('user_goods')
                                        .add({
                                          data: {
                                            userId: u._id,
                                            goodsId: f.goodsId,
                                            goodsName: f.goodsName,
                                            stock: f.quantity,
                                            unit: f.unit,
                                          },
                                        })
                                    );
                                  case 28:
                                    t.next = 6;
                                    break;
                                  case 30:
                                    t.next = 35;
                                    break;
                                  case 32:
                                    (t.prev = 32),
                                      (t.t0 = t.catch(4)),
                                      c.e(t.t0);
                                  case 35:
                                    return (t.prev = 35), c.f(), t.finish(35);
                                  case 38:
                                    return (
                                      (t.next = 40),
                                      a
                                        .collection('transfer_requests')
                                        .doc(i)
                                        .update({
                                          data: { status: 'accepted' },
                                        })
                                    );
                                  case 40:
                                    wx.hideLoading(),
                                      wx.showToast({
                                        title: '移交成功',
                                        icon: 'success',
                                      }),
                                      s.loadRequests(),
                                      (t.next = 50);
                                    break;
                                  case 45:
                                    (t.prev = 45),
                                      (t.t1 = t.catch(2)),
                                      console.error('移交失败', t.t1),
                                      wx.hideLoading(),
                                      wx.showToast({
                                        title: '操作失败',
                                        icon: 'none',
                                      });
                                  case 50:
                                  case 'end':
                                    return t.stop();
                                }
                            },
                            r,
                            null,
                            [
                              [2, 45],
                              [4, 32, 35, 38],
                            ],
                          );
                        }),
                      );
                      return function (e) {
                        return o.apply(this, arguments);
                      };
                    })(),
                  });
              case 4:
              case 'end':
                return c.stop();
            }
        }, c);
      }),
    )();
  },
});
