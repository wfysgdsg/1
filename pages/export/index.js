var e = require('../../@babel/runtime/helpers/regeneratorRuntime'),
  t = require('../../@babel/runtime/helpers/asyncToGenerator'),
  a = wx.cloud.database(),
  n = a.command;
Page({
  data: {
    uiText: {
      dataType: '数据类型',
      choose: '请选择',
      dateRange: '时间范围',
      start: '开始：',
      end: '结束：',
      exportExcel: '导出 Excel',
      preview: '预览（前 10 条）',
    },
    dataTypes: [
      { name: '借货客户明细', type: 'borrow_customer' },
      { name: '销售记录明细', type: 'sale_detail' },
      { name: '调货记录明细', type: 'transfer' },
      { name: '个人库存快照', type: 'stock' },
    ],
    selectedType: null,
    startDate: '',
    endDate: '',
    previewData: [],
  },
  onLoad: function () {
    var e = new Date().toISOString().split('T')[0],
      t = new Date(Date.now() - 2592e6).toISOString().split('T')[0];
    this.setData({ startDate: t, endDate: e });
  },
  onTypeChange: function (e) {
    var t = e.detail.value;
    this.setData({ selectedType: this.data.dataTypes[t] });
  },
  onStartDateChange: function (e) {
    this.setData({ startDate: e.detail.value });
  },
  onEndDateChange: function (e) {
    this.setData({ endDate: e.detail.value });
  },
  exportData: function () {
    var c = this;
    return t(
      e().mark(function t() {
        var o,
          r,
          s,
          i,
          l,
          d,
          u,
          m,
          f,
          p,
          w,
          x,
          g,
          h,
          D,
          y,
          T,
          b,
          v,
          k,
          _,
          N,
          S,
          L,
          E;
        return e().wrap(
          function (e) {
            for (;;)
              switch ((e.prev = e.next)) {
                case 0:
                  if (
                    ((o = c.data),
                    (r = o.selectedType),
                    (s = o.startDate),
                    (i = o.endDate),
                    (l = wx.getStorageSync('userInfo')),
                    r)
                  ) {
                    e.next = 5;
                    break;
                  }
                  return (
                    wx.showToast({ title: '请选择导出类型', icon: 'none' }),
                    e.abrupt('return')
                  );
                case 5:
                  if (
                    (wx.showLoading({ title: '正在提取数据...', mask: !0 }),
                    (e.prev = 6),
                    (d = new Date(s).getTime()),
                    (u = new Date(i).getTime() + 864e5),
                    (m = '\ufeff'),
                    (f = ''
                      .concat(r.name, '_')
                      .concat(s, '_')
                      .concat(i, '.csv')),
                    'borrow_customer' !== r.type)
                  ) {
                    e.next = 22;
                    break;
                  }
                  return (
                    (p = a
                      .collection('borrow')
                      .where({ createTime: n.gte(d).and(n.lt(u)) })),
                    'root' !== l.role && (p = p.where({ borrowerId: l._id })),
                    (e.next = 16),
                    p
                      .orderBy('locationName', 'asc')
                      .orderBy('borrowDate', 'desc')
                      .get()
                  );
                case 16:
                  (w = e.sent),
                    (x = w.data || []),
                    (m +=
                      '借货单位,商品名称,数量,单位,成本价,售价,借货日期,当前状态,备注\n'),
                    x.forEach(function (e) {
                      var t =
                        'pending' === e.status
                          ? '待处理'
                          : 'returned' === e.status
                            ? '已归还'
                            : '调货中';
                      m += ''
                        .concat(e.locationName, ',')
                        .concat(e.goodsName, ',')
                        .concat(e.quantity, ',')
                        .concat(e.unit || '', ',')
                        .concat(e.costPrice, ',')
                        .concat(e.salePrice, ',')
                        .concat(e.borrowDate, ',')
                        .concat(t, ',')
                        .concat(e.memo || '', '\n');
                    }),
                    (e.next = 51);
                  break;
                case 22:
                  if ('sale_detail' !== r.type) {
                    e.next = 33;
                    break;
                  }
                  return (
                    (g = a
                      .collection('sale')
                      .where({ saleTime: n.gte(d).and(n.lt(u)) })),
                    'root' !== l.role && (g = g.where({ sellerId: l._id })),
                    (e.next = 27),
                    g
                      .orderBy('contactName', 'asc')
                      .orderBy('saleDate', 'desc')
                      .get()
                  );
                case 27:
                  (h = e.sent),
                    (D = h.data || []),
                    (m +=
                      '销售日期,客户名称,商品名称,数量,单位,成交价,成本价,单笔利润,付款状态,备注\n'),
                    D.forEach(function (e) {
                      (e.goodsDetail || []).forEach(function (t) {
                        var a = 'paid' === e.payStatus ? '已结清' : '未付款';
                        m += ''
                          .concat(e.saleDate, ',')
                          .concat(e.contactName || e.locationName, ',')
                          .concat(t.goodsName, ',')
                          .concat(t.quantity, ',')
                          .concat(t.unit || '', ',')
                          .concat(t.salePrice, ',')
                          .concat(t.costPrice, ',')
                          .concat(t.profit, ',')
                          .concat(a, ',')
                          .concat(e.remark || '', '\n');
                      });
                    }),
                    (e.next = 51);
                  break;
                case 33:
                  if ('transfer' !== r.type) {
                    e.next = 43;
                    break;
                  }
                  return (
                    (y = a
                      .collection('transfer_requests')
                      .where({ createTime: n.gte(d).and(n.lt(u)) })),
                    (e.next = 37),
                    y.orderBy('createTime', 'desc').get()
                  );
                case 37:
                  (T = e.sent),
                    (b = T.data || []),
                    (m += '申请时间,发送人,接收人,原单位,商品明细,状态\n'),
                    b.forEach(function (e) {
                      var t =
                          'accepted' === e.status
                            ? '已接收'
                            : 'rejected' === e.status
                              ? '已拒绝'
                              : '待处理',
                        a = (e.goodsList || [])
                          .map(function (e) {
                            return ''
                              .concat(e.goodsName, 'x')
                              .concat(e.quantity);
                          })
                          .join(' | ');
                      m += ''
                        .concat(e.createTime.toLocaleString(), ',')
                        .concat(e.senderName, ',')
                        .concat(e.receiverName, ',')
                        .concat(e.fromCustomerName, ',"')
                        .concat(a, '",')
                        .concat(t, '\n');
                    }),
                    (e.next = 51);
                  break;
                case 43:
                  if ('stock' !== r.type) {
                    e.next = 51;
                    break;
                  }
                  return (
                    (v = a.collection('user_goods')),
                    'root' !== l.role && (v = v.where({ userId: l._id })),
                    (e.next = 48),
                    v.get()
                  );
                case 48:
                  (k = e.sent),
                    (m += '持有人,商品名称,当前库存,单位,最后变动日期\n'),
                    k.data.forEach(function (e) {
                      m += ''
                        .concat(e.userName || '本人', ',')
                        .concat(e.goodsName, ',')
                        .concat(e.stock, ',')
                        .concat(e.unit || '', ',')
                        .concat(e.lastSaleDate || '无记录', '\n');
                    });
                case 51:
                  return (
                    (_ = wx.getFileSystemManager()),
                    (N = ''.concat(wx.env.USER_DATA_PATH, '/').concat(f)),
                    _.writeFileSync(N, m, 'utf8'),
                    (e.next = 56),
                    wx.cloud.uploadFile({
                      cloudPath: 'exports/'.concat(Date.now(), '_').concat(f),
                      filePath: N,
                    })
                  );
                case 56:
                  return (
                    (S = e.sent),
                    (e.next = 59),
                    wx.cloud.getTempFileURL({ fileList: [S.fileID] })
                  );
                case 59:
                  (L = e.sent),
                    (E = L.fileList[0].tempFileURL),
                    wx.hideLoading(),
                    wx.showModal({
                      title: '导出成功',
                      content: '数据已生成，请复制链接后在浏览器打开下载。',
                      confirmText: '复制链接',
                      success: function (e) {
                        e.confirm && wx.setClipboardData({ data: E });
                      },
                    }),
                    (e.next = 70);
                  break;
                case 65:
                  (e.prev = 65),
                    (e.t0 = e.catch(6)),
                    wx.hideLoading(),
                    console.error('导出失败', e.t0),
                    wx.showToast({ title: '导出失败', icon: 'none' });
                case 70:
                case 'end':
                  return e.stop();
              }
          },
          t,
          null,
          [[6, 65]],
        );
      }),
    )();
  },
});
