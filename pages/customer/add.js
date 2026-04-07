var e = require('../../@babel/runtime/helpers/regeneratorRuntime'),
  t = require('../../@babel/runtime/helpers/asyncToGenerator'),
  a = wx.cloud.database();
Page({
  data: { id: '', name: '', remark: '', isEdit: !1 },
  onLoad: function (e) {
    e.id && (this.setData({ id: e.id, isEdit: !0 }), this.loadCustomer(e.id));
  },
  loadCustomer: function (r) {
    var n = this;
    return t(
      e().mark(function t() {
        var o;
        return e().wrap(
          function (e) {
            for (;;)
              switch ((e.prev = e.next)) {
                case 0:
                  return (
                    (e.prev = 0),
                    (e.next = 3),
                    a.collection('customer').doc(r).get()
                  );
                case 3:
                  (o = e.sent),
                    n.setData({
                      name: o.data.name || '',
                      remark: o.data.remark || '',
                    }),
                    (e.next = 10);
                  break;
                case 7:
                  (e.prev = 7),
                    (e.t0 = e.catch(0)),
                    console.error('加载失败', e.t0);
                case 10:
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
  onNameInput: function (e) {
    this.setData({ name: e.detail.value });
  },
  onRemarkInput: function (e) {
    this.setData({ remark: e.detail.value });
  },
  submit: function () {
    var r = this;
    return t(
      e().mark(function t() {
        var n;
        return e().wrap(
          function (e) {
            for (;;)
              switch ((e.prev = e.next)) {
                case 0:
                  if (r.data.name) {
                    e.next = 4;
                    break;
                  }
                  return (
                    wx.showToast({ title: '请填写存放位置', icon: 'none' }),
                    e.abrupt('return')
                  );
                case 4:
                  if (
                    ((n = {
                      name: r.data.name,
                      remark: r.data.remark,
                      updateTime: a.serverDate(),
                    }),
                    (e.prev = 5),
                    !r.data.isEdit)
                  ) {
                    e.next = 11;
                    break;
                  }
                  return (
                    (e.next = 9),
                    a.collection('customer').doc(r.data.id).update({ data: n })
                  );
                case 9:
                  e.next = 14;
                  break;
                case 11:
                  return (
                    (n.createTime = a.serverDate()),
                    (e.next = 14),
                    a.collection('customer').add({ data: n })
                  );
                case 14:
                  wx.showToast({ title: '保存成功' }),
                    setTimeout(function () {
                      return wx.navigateBack();
                    }, 1500),
                    (e.next = 22);
                  break;
                case 18:
                  (e.prev = 18),
                    (e.t0 = e.catch(5)),
                    console.error('保存失败', e.t0),
                    wx.showToast({ title: '保存失败', icon: 'none' });
                case 22:
                case 'end':
                  return e.stop();
              }
          },
          t,
          null,
          [[5, 18]],
        );
      }),
    )();
  },
  goBack: function () {
    wx.navigateBack();
  },
});
