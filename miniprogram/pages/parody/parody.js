Page({
  data: {
    showModal: true,
    accounts: [],
    editIndex: null,
    editName: '',
    showLuModal: false,
    showKickModal: false,
    luUsername: '',
    powerTapCount: 0,
    powerTapTimer: null,
    showPasswordModal: false,
    inputPassword: ''
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
  closeModal() {
    this.setData({ showModal: false });
  },
  onEditName(e) {
    const { index, name } = e.currentTarget.dataset;
    if (name === '卢加轩') return; // 禁止卢加轩进入编辑状态
    this.setData({
      editIndex: index,
      editName: name || ''
    });
  },
  onEditNameInput(e) {
    this.setData({ editName: e.detail.value });
  },
  onSaveEdit(e) {
    const { index, username } = e.currentTarget.dataset;
    const newName = this.data.editName.trim();
    if (!newName) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' });
      return;
    }
    wx.cloud.callFunction({
      name: 'updateCredential',
      data: { username, name: newName },
      success: res => {
        wx.showToast({ title: '修改成功', icon: 'success' });
        this.setData({ editIndex: null, editName: '' });
        this.loadAccounts();
      },
      fail: () => {
        wx.showToast({ title: '修改失败', icon: 'none' });
      }
    });
  },
  onLuEdit(e) {
    this.setData({
      showLuModal: true,
      luUsername: e.currentTarget.dataset.username
    });
  },
  onLuSorry() {
    this.setData({ showLuModal: false, showKickModal: true });
  },
  onLuKicked() {
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
  },
  onPowerTap() {
    if (this.data.powerTapTimer) clearTimeout(this.data.powerTapTimer);
    this.setData({ powerTapCount: this.data.powerTapCount + 1 });
    if (this.data.powerTapCount >= 10) {
      this.setData({ powerTapCount: 0, showPasswordModal: true });
    } else {
      this.data.powerTapTimer = setTimeout(() => {
        this.setData({ powerTapCount: 0 });
      }, 2000);
    }
  },
  onPasswordInput(e) {
    this.setData({ inputPassword: e.detail.value });
  },
  async onPasswordConfirm() {
    const inputPwd = this.data.inputPassword;
    wx.cloud.callFunction({
      name: 'getCredentials',
      success: res => {
        if (res.result && Array.isArray(res.result.data)) {
          const user = res.result.data.find(u => u.username === '17600378510');
          if (user && user.password === inputPwd) {
            this.setData({ showPasswordModal: false, inputPassword: '' });
            wx.navigateTo({ url: '/pages/dormitoryManagement/dormitoryManagement' });
          } else {
            wx.showToast({ title: '密码错误', icon: 'none' });
            this.setData({ inputPassword: '' });
          }
        } else {
          wx.showToast({ title: '校验失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '校验失败', icon: 'none' });
      }
    });
  },
  closePasswordModal() {
    this.setData({ showPasswordModal: false, inputPassword: '' });
  }
}); 