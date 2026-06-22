Component({
  properties: {
    currentPage: {
      type: Number,
      value: 1
    },
    totalPages: {
      type: Number,
      value: 0
    },
    totalCount: {
      type: Number,
      value: 0
    },
    showTotal: {
      type: Boolean,
      value: true
    }
  },
  methods: {
    onPrev() {
      if (this.data.currentPage > 1) {
        this.triggerEvent('prev');
      }
    },
    onNext() {
      if (this.data.currentPage < this.data.totalPages) {
        this.triggerEvent('next');
      }
    }
  }
});
