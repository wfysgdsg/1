/**
 * 借货明细详情页逻辑 (反编译还原整理)
 * 整理日期：2024-03-26
 */
const db = wx.cloud.database();
const _ = db.command;
const { fetchAll } = require('../../utils/db');

Page({
  data: {
    customerId: '',
    customerName: '',
    tab: 'time', // time (按日期分组) 或 goods (按商品分组)
    timeGroups: [],
    goodsGroups: [],
    rawRecords: [],
    selectedIds: [],
    isBatchMode: false,
    loading: false,
    showStaffPicker: false,
    staffList: [],
    selectedStaffIndex: 0,
  },

  onLoad: function (options) {
    // 处理页面参数
    if (options.id || options.customer) {
      const name = options.customer ? decodeURIComponent(options.customer) : '客户借货';
      const id = options.id || '';
      
      this.setData({
        customerName: name,
        customerId: id
      });
      
      wx.setNavigationBarTitle({ title: `${name} - 借货详情` });
      this.loadDetail();
      this.loadStaffList();
    }
  },

  /**
   * 加载当前客户的借货明细
   */
  async loadDetail() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    const userId = wx.getStorageSync('userId') || userInfo._id;
    if (!userId) return;

    this.setData({ loading: true });

    try {
      // 1. 构建查询条件
      let where = {
        status: 'pending'
      };

      // 如果有 customerId 则匹配，否则通过名称模糊匹配 (兼容逻辑)
      if (this.data.customerId && this.data.customerId !== 'unknown') {
        where = _.and([where, _.or([
          { contactId: this.data.customerId },
          { locationId: this.data.customerId }
        ])]);
      } else {
        where.contactName = this.data.customerName;
      }

      // 权限过滤
      if (userInfo.role !== 'root') {
        where.borrowerId = userId;
      }

      // 2. 获取数据并处理分组
      const records = await fetchAll(db.collection('borrow').where(where).orderBy('createTime', 'desc'));
      
      // 格式化记录日期
      const formattedRecords = records.map(r => ({
        ...r,
        borrowDate: this.formatDate(r.borrowDate || r.createTime)
      }));

      // 按时间分组
      const timeGroups = this.groupByTime(formattedRecords);
      // 按商品分组
      const goodsGroups = this.groupByGoods(formattedRecords);

      this.setData({
        rawRecords: formattedRecords,
        timeGroups,
        goodsGroups,
        loading: false
      });

    } catch (err) {
      console.error('加载借货详情失败', err);
      this.setData({ loading: false });
    }
  },

  groupByTime(records) {
    const map = {};
    records.forEach(r => {
      const date = r.borrowDate;
      if (!map[date]) {
        map[date] = { date, items: [], totalQty: 0 };
      }
      map[date].items.push(r);
      map[date].totalQty += (Number(r.quantity) || 0);
    });
    return Object.values(map).sort((a, b) => new Date(b.date) - new Date(a.date));
  },

  groupByGoods(records) {
    const map = {};
    records.forEach(r => {
      const gId = r.goodsId;
      if (!map[gId]) {
        map[gId] = {
          goodsId: gId,
          goodsName: r.goodsName,
          unit: r.unit || '',
          totalQty: 0,
          items: []
        };
      }
      map[gId].items.push(r);
      map[gId].totalQty += (Number(r.quantity) || 0);
    });
    return Object.values(map).sort((a, b) => b.totalQty - a.totalQty);
  },

  formatDate(time) {
    const d = new Date(time);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  /**
   * 加载员工列表（用于调货转移）
   */
  async loadStaffList() {
    try {
      const res = await db.collection('users').where({
        role: _.neq('root')
      }).get();
      this.setData({ staffList: res.data || [] });
    } catch (err) {
      console.error('加载员工列表失败', err);
    }
  },

  /**
   * 切换批量模式
   */
  toggleBatchMode: function () {
    this.setData({
      isBatchMode: !this.data.isBatchMode,
      selectedIds: []
    });
  },

  /**
   * 全选/取消全选
   */
  selectAll: function () {
    if (this.data.selectedIds.length === this.data.rawRecords.length) {
      this.setData({ selectedIds: [] });
    } else {
      this.setData({ selectedIds: this.data.rawRecords.map(r => r._id) });
    }
  },

  /**
   * 批量选中切换 (WXML调用名为 onItemSelect)
   */
  onItemSelect: function (e) {
    const id = e.currentTarget.dataset.id;
    const list = [...this.data.selectedIds];
    const idx = list.indexOf(id);
    if (idx > -1) list.splice(idx, 1);
    else list.push(id);
    
    this.setData({
      selectedIds: list
    });
  },

  /**
   * 批量转销售 (WXML调用名为 batchSale)
   * 将选中的借货单数据存入本地缓存并跳转到销售页面
   */
  batchSale: function () {
    const selected = this.data.rawRecords.filter(r => this.data.selectedIds.includes(r._id));
    if (!selected.length) return;

    const importData = {
      customer: {
        _id: this.data.customerId,
        name: this.data.customerName
      },
      goods: selected.map(s => ({
        _id: s.goodsId,
        name: s.goodsName,
        quantity: s.quantity,
        costPrice: s.costPrice,
        salePrice: s.salePrice,
        unit: s.unit,
        originalBorrowId: s._id
      }))
    };

    wx.setStorageSync('temp_sale_import', importData);
    wx.navigateTo({ url: '/pages/sale/add?mode=import' });
  },

  /**
   * 归还货品
   */
  async returnGoods(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.rawRecords.find(r => r._id === id);
    if (!item) return;

    const confirmRes = await wx.showModal({
      title: '确认归还',
      content: `确定已归还 ${item.goodsName} x ${item.quantity} 吗？这会同时扣减您的个人库存。`
    });

    if (!confirmRes.confirm) return;

    wx.showLoading({ title: '处理中...' });

    try {
      // 1. 扣减个人库存
      const userInfo = wx.getStorageSync('userInfo');
      const userId = wx.getStorageSync('userId') || userInfo._id;
      
      await db.collection('user_goods').where({
        userId,
        goodsId: item.goodsId
      }).update({
        data: {
          stock: _.inc(-Number(item.quantity)),
          updateTime: db.serverDate()
        }
      });

      // 2. 更新借货记录状态
      await db.collection('borrow').doc(id).update({
        data: {
          status: 'returned',
          updateTime: db.serverDate()
        }
      });

      wx.hideLoading();
      wx.showToast({ title: '处理成功' });
      this.loadDetail();

    } catch (err) {
      wx.hideLoading();
      console.error('归还失败', err);
    }
  },

  switchTab: function (e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },
});
