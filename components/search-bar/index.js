Component({
  properties: {
    placeholder: {
      type: String,
      value: '搜索'
    },
    value: {
      type: String,
      value: ''
    },
    icon: {
      type: String,
      value: '搜'
    }
  },
  methods: {
    onInput(e) {
      this.triggerEvent('change', { value: e.detail.value });
    },
    onClear() {
      this.triggerEvent('change', { value: '' });
    }
  }
});
