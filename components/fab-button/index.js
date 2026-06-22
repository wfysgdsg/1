Component({
  properties: {
    text: {
      type: String,
      value: ''
    },
    icon: {
      type: String,
      value: ''
    },
    position: {
      type: String,
      value: 'center'  // 'center' | 'right'
    },
    color: {
      type: String,
      value: 'primary'  // 'primary' | 'purple'
    }
  },
  methods: {
    onTap() {
      this.triggerEvent('tap');
    }
  }
});
