Page({
  data: {
    accounts: [],
    showLuModal: false,
    showKickModal: false
  },
  onLoad() {
    this.loadAccounts();
  },
  loadAccounts() {
    wx.cloud.callFunction({
      name: 'getCredentials',
      success: res => {
        if (res.result && Array.isArray(res.result.data)) {
          this.setData({ accounts: res.result.data });
        }
      }
    });
  },
  onSwitchChange(e) {
    const username = e.currentTarget.dataset.username;
    const value = e.detail.value;
    if (username === '17600378510') {
      this.setData({ showLuModal: true });
      return;
    }
    wx.cloud.callFunction({
      name: 'updateCredential',
      data: { username, is555: value },
      success: () => {
        wx.showToast({ title: '修改成功', icon: 'success' });
        this.loadAccounts();
      },
      fail: () => {
        wx.showToast({ title: '修改失败', icon: 'none' });
      }
    });
  },
  onLuSorry() {
    this.setData({ showLuModal: false, showKickModal: true });
    setTimeout(() => {
      // 1. 将当前登录账号的is555设为false
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo && userInfo.username) {
        wx.cloud.callFunction({
          name: 'updateCredential',
          data: { username: userInfo.username, is555: false },
          complete: () => {
            // 2. 清除本地登录信息并跳转到登录页
            wx.removeStorageSync('userInfo');
            wx.removeStorageSync('loginTime');
            wx.redirectTo({ url: '/pages/login/login' });
          }
        });
      } else {
        wx.redirectTo({ url: '/pages/login/login' });
      }
    }, 5000);
  },
  onKickModalClose() {
    this.setData({ showKickModal: false });
  },
  onLuSwitchTap() {
    this.setData({ showLuModal: true });
  }
}); 