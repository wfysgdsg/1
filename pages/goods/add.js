/**
 * 新增/编辑商品页逻辑 (反编译还原整理)
 * 整理日期：2024-03-26
 */
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    id: '',
    name: '',
    category: 'hardware', // 默认硬件
    spec: '',
    unit: '',
    costPrice: '',
    salePrice: '',
    remark: '',
    isEdit: false,
    uiText: {
      goodsName: '商品名称 *',
      goodsNamePlaceholder: '请输入商品名称',
      category: '商品分类 *',
      spec: '规格/型号',
      specPlaceholder: '请输入规格或型号',
      unit: '单位',
      unitPlaceholder: '如：个、箱、件',
      costPrice: '成本价 *',
      costPricePlaceholder: '请输入成本价',
      salePrice: '标准售价 *',
      salePricePlaceholder: '请输入建议售价',
      remark: '备注',
      remarkPlaceholder: '可选填写备注',
      cancel: '取消',
      save: '保存',
    },
  },

  onLoad: function (options) {
    if (options.id) {
      this.setData({
        id: options.id,
        isEdit: true
      });
      this.loadGoods(options.id);
    }
  },

  /**
   * 加载待编辑的商品详情
   */
  async loadGoods(id) {
    try {
      const res = await db.collection('goods').doc(id).get();
      const goods = res.data;
      this.setData({
        name: goods.name,
        category: goods.category || 'hardware',
        spec: goods.spec || '',
        unit: goods.unit || '',
        costPrice: String(goods.costPrice || ''),
        salePrice: String(goods.salePrice || ''),
        remark: goods.remark || '',
      });
    } catch (err) {
      console.error('加载商品失败', err);
    }
  },

  // 输入绑定
  onNameInput: function (e) {
    this.setData({ name: e.detail.value });
  },
  onCategoryChange: function (e) {
    this.setData({ category: e.detail.value });
  },
  onSpecInput: function (e) {
    this.setData({ spec: e.detail.value });
  },
  onUnitInput: function (e) {
    this.setData({ unit: e.detail.value });
  },
  onCostPriceInput: function (e) {
    this.setData({ costPrice: e.detail.value });
  },
  onSalePriceInput: function (e) {
    this.setData({ salePrice: e.detail.value });
  },
  onRemarkInput: function (e) {
    this.setData({ remark: e.detail.value });
  },

  /**
   * 提交保存商品
   */
  async submit() {
    const { name, category, costPrice, salePrice } = this.data;
    if (!name || !costPrice || !salePrice) {
      wx.showToast({ title: '请填写必填项', icon: 'none' });
      return;
    }

    const goodsData = {
      name: this.data.name,
      category: this.data.category,
      spec: this.data.spec,
      unit: this.data.unit,
      costPrice: parseFloat(this.data.costPrice),
      salePrice: parseFloat(this.data.salePrice),
      remark: this.data.remark,
      updateTime: db.serverDate(),
    };

    try {
      if (this.data.isEdit) {
        // 更新现有商品
        await db.collection('goods').doc(this.data.id).update({
          data: goodsData
        });
      } else {
        // 新增商品
        goodsData.createTime = db.serverDate();
        await db.collection('goods').add({
          data: goodsData
        });
      }

      wx.showToast({ title: '保存成功' });
      setTimeout(() => wx.navigateBack(), 1500);

    } catch (err) {
      console.error('保存失败', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  goBack: () => wx.navigateBack(),
});
