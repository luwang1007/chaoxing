const app = getApp()

Page({
  data: {
    username: '',
    password: '',
    isMainAccount: true,
    showCaoModal: false,
    showUpdateLogModal: false,
    loading: false,
    successToast: false,
    successToast: false
  },

  onLoad() {
    // 检查是否已登录
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      wx.redirectTo({
        url: '/pages/courses/courses'
      });
    } else {
      // 未登录，清除信息
      wx.removeStorageSync('userInfo');
      wx.removeStorageSync('loginTime');
    }
    // 每次进入都弹出更新日志
    this.setData({ showUpdateLogModal: true });
  },

  // 输入框内容变化时触发
  onInputChange(e) {
    const { field } = e.currentTarget.dataset
    this.setData({
      [field]: e.detail.value
    })
  },

  // 切换账号类型
  onAccountTypeChange(e) {
    this.setData({
      isMainAccount: e.detail.value
    })
  },

  // 登录处理
  async handleLogin() {
    const { username, password, isMainAccount } = this.data;
    
    if (!username || !password) {
      wx.showToast({
        title: '请填写完整信息',
        icon: 'none'
      });
      return;
    }

    this.setData({ loading: true });

    try {
      // 获取当前账号列表
      const { result: credentialsResult } = await wx.cloud.callFunction({
        name: 'getCredentials'
      });

      if (!credentialsResult.success) {
        throw new Error('获取账号列表失败');
      }

      const accounts = credentialsResult.data || [];
      const isFirstAccount = accounts.length === 0;

      // 调用云函数登录
      const { result } = await wx.cloud.callFunction({
        name: 'loginUser',
        data: {
          username,
          password,
          // 只有在以下情况才设置 isMainAccount 为 true：
          // 1. 是第一个账号
          // 2. 用户明确勾选了设置为主账号
          isMainAccount: isFirstAccount || isMainAccount
        }
      });

      if (!result || !result.success) {
        throw new Error(result?.message || '登录失败');
      }

      // 新增：校验is555字段
      if (!result.userInfo || result.userInfo.is555 === false) {
        this.setData({ loading: false });
        this.setData({ showCaoModal: true });
        return;
      }

      // 更新全局数据
      app.globalData.userInfo = {
        username,
        password,
        isMainAccount: result.userInfo.isMainAccount
      };
      // 保存本地登录信息和时间
      wx.setStorageSync('userInfo', {
        username,
        password,
        isMainAccount: result.userInfo.isMainAccount
      });
      wx.setStorageSync('loginTime', Date.now());

      this.setData({ loading: false, successToast: true });

      // 延迟跳转，确保 toast 显示完成
      setTimeout(() => {
        this.setData({ successToast: false });
        wx.reLaunch({
          url: '/pages/courses/courses'
        });
      }, 1500);
    } catch (error) {
      console.error('登录失败:', error);
      this.setData({ loading: false });
      wx.showToast({
        title: error.message || '登录失败',
        icon: 'none'
      });
    }
  },

  // 关闭自定义弹窗
  closeCaoModal() {
    this.setData({ showCaoModal: false });
  },

  // 新增：关闭更新日志弹窗
  closeUpdateLogModal() {
    this.setData({ showUpdateLogModal: false });
  }
}) 