var db = wx.cloud.database();
var _ = db.command;

Page({
  data: {
    _anim: true,
    list: [],
    loading: false,
    hasMore: true,
    pageSize: 20,
  },

  onShow: function () {
    this.loadList(true);
  },

  loadList: function (reset) {
    var that = this;
    if (that.data.loading) return;
    that.setData({ loading: true });

    var query = db.collection('delivery_notes').orderBy('createTime', 'desc');

    if (!reset && that.data.list.length > 0) {
      var lastItem = that.data.list[that.data.list.length - 1];
      query = query.startAfter(lastItem.createTime);
    }
    query = query.limit(that.data.pageSize);

    query.get().then(function (res) {
      var items = (res.data || []).map(function (d) {
        return {
          _id: d._id,
          receiptNo: d.receiptNo || '',
          contactName: d.contactName || '未知客户',
          saleDateStr: d.saleDateStr || '',
          totalInvoiceAmountStr: d.totalInvoiceAmount ? d.totalInvoiceAmount.toFixed(2) : '0.00',
          sellerName: d.sellerName || '',
          hasCustomerSign: !!d.customerSignature,
          hasSellerSign: !!d.sellerSignature,
          goodsCount: (d.goodsList || []).length,
        };
      });

      var list = reset ? items : that.data.list.concat(items);
      that.setData({
        list: list,
        loading: false,
        hasMore: items.length >= that.data.pageSize,
      });
    }).catch(function (err) {
      console.error('加载送货单列表失败:', err);
      that.setData({ loading: false });
    });
  },

  loadMore: function () {
    if (!this.data.hasMore || this.data.loading) return;
    this.loadList(false);
  },

  goDetail: function (e) {
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/sale/delivery?deliveryId=' + id });
  },

  onPullDownRefresh: function () {
    this.loadList(true);
    wx.stopPullDownRefresh();
  },
});
