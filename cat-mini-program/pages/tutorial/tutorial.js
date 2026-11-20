Page({
  data: { step: 0 },
  next() {
    this.setData({ step: (this.data.step + 1) % 3 })
  },
  onBack() {
    wx.navigateBack()
  }
})
