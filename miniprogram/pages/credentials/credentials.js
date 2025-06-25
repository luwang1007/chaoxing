const app = getApp();
const API = require('../../utils/api.js');

Page({
  data: {
    accounts: [], // 统一使用 accounts
    loading: false,
    showAddModal: false,
    newAccount: {
      username: '',
      password: ''
    },
    userInfo: null,
    secretTapCount: 0,
    secretTapTimer: null,
    refreshingAll: false,
    showSwitchPwdModal: false,
    switchPwd: '',
    pendingSwitchIndex: null
  },

  onLoad() {
    this.loadUserInfo();
    this.loadAccounts();
  },

  onShow() {
    this.loadUserInfo();
    this.loadAccounts();
  },

  // 加载当前用户信息
  loadUserInfo() {
    const userInfo = app.globalData.userInfo;
    console.log('全局用户信息:', userInfo);
    console.log('全局用户信息类型:', typeof userInfo);
    console.log('全局用户信息用户名:', userInfo?.username);
    
    if (!userInfo || !userInfo.username) {
      console.warn('全局用户信息不完整');
      return;
    }

    this.setData({ 
      userInfo: {
        username: userInfo.username,
        password: userInfo.password,
        isMainAccount: userInfo.isMainAccount
      }
    });
    console.log('设置后的页面用户信息:', this.data.userInfo);
  },

  // 加载账号列表
  async loadAccounts() {
    this.setData({ loading: true });
    try {
      console.log('开始加载账号列表');
      const { result } = await wx.cloud.callFunction({
        name: 'getCredentials'
      });
      
      console.log('云函数返回结果:', result);

      if (result.success) {
        console.log('获取到的账号列表:', result.data);
        console.log('账号列表长度:', result.data.length);
        // 打印每个账号的用户名
        result.data.forEach((account, index) => {
          console.log(`账号${index + 1}用户名:`, account.username);
        });
        this.setData({
          accounts: result.data
        });
      } else {
        console.error('获取账号列表失败:', result.message);
        wx.showToast({
          title: result.message || '获取账号列表失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('获取账号列表失败:', error);
      wx.showToast({
        title: '获取账号列表失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 切换用户并登录
  async switchUser(e) {
    const { index } = e.currentTarget.dataset;
    const account = this.data.accounts[index];
    if (!account) {
      wx.showToast({ title: '账号信息不存在', icon: 'none' });
      return;
    }
    // 如果是当前账号，不执行切换
    if (account.username === this.data.userInfo.username) {
      wx.showToast({ title: '当前已是该账号', icon: 'none' });
      return;
    }
    // 弹出密码输入框
    this.setData({ showSwitchPwdModal: true, switchPwd: '', pendingSwitchIndex: index });
  },

  // 密码输入
  onSwitchPwdInput(e) {
    this.setData({ switchPwd: e.detail.value });
  },

  // 确认切换
  async onConfirmSwitchPwd() {
    if (this.data.switchPwd !== '20040610') {
      wx.showToast({ title: '密码错误', icon: 'none' });
      return;
    }
    const index = this.data.pendingSwitchIndex;
    const account = this.data.accounts[index];
    this.setData({ showSwitchPwdModal: false, switchPwd: '', pendingSwitchIndex: null });
    // 下面是原切换逻辑
    wx.showLoading({ title: '切换中...', mask: true });
    try {
      const switchResult = await wx.cloud.callFunction({
        name: 'switchMainAccount',
        data: { username: account.username }
      });
      if (!switchResult.result.success) {
        throw new Error(switchResult.result.message || '设置主账号失败');
      }
      app.globalData.userInfo = {
        username: account.username,
        password: account.password,
        isMainAccount: true
      };
      this.setData({
        userInfo: {
          username: account.username,
          password: account.password,
          isMainAccount: true
        }
      });
      wx.hideLoading();
      wx.showToast({ title: '切换成功', icon: 'success', duration: 1500 });
    } catch (error) {
      console.error('切换账号失败:', error);
      wx.hideLoading();
      wx.showToast({ title: error.message || '切换失败', icon: 'none' });
    }
  },

  // 取消切换
  onCancelSwitchPwd() {
    this.setData({ showSwitchPwdModal: false, switchPwd: '', pendingSwitchIndex: null });
  },

  // 删除账号
  async deleteAccount(e) {
    const { index } = e.currentTarget.dataset;
    const account = this.data.accounts[index];

    if (!account) {
      wx.showToast({
        title: '账号信息不存在',
        icon: 'none'
      });
      return;
    }

    const that = this; // 保存this引用
    wx.showModal({
      title: '确认删除',
      content: `确定要删除账号 ${account.username} 吗？`,
      success: async function(res) {
        if (res.confirm) {
          wx.showLoading({
            title: '删除中...',
            mask: true
          });

    try {
            // 调用云函数删除账号
      const { result } = await wx.cloud.callFunction({
        name: 'deleteCredential',
        data: {
          username: account.username
        }
      });

      if (result.success) {
        wx.showToast({
          title: '删除成功',
          icon: 'success'
        });
              that.loadAccounts(); // 使用保存的this引用
      } else {
              wx.showToast({
                title: result.message || '删除失败',
                icon: 'none'
              });
      }
    } catch (error) {
      console.error('删除账号失败:', error);
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  // 显示添加表单
  showAddAccount() {
    this.setData({
      showAddModal: true,
      newAccount: {
        username: '',
        password: ''
      }
    });
  },

  // 隐藏添加表单
  hideAddModal() {
    this.setData({ showAddModal: false });
  },

  // 输入框变化
  handleInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({
      [`newAccount.${field}`]: e.detail.value
    });
  },

  // 添加账号
  async addAccount() {
    const { username, password } = this.data.newAccount;
    
    if (!username || !password) {
      wx.showToast({
        title: '请填写完整信息',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({
      title: '验证中...',
      mask: true
    });

    try {
      // 调用云函数loginUser进行登录验证
      const { result } = await wx.cloud.callFunction({
        name: 'loginUser',
        data: {
          username,
          password,
          isMainAccount: this.data.accounts.length === 0 // 如果是第一个账号，自动设为主账号
        }
      });

      if (!result || !result.success) {
        throw new Error(result?.message || '登录失败');
      }

      // 登录成功，调用云函数添加账号
      const addResult = await wx.cloud.callFunction({
        name: 'addCredential',
        data: {
          username,
          password,
          isMainAccount: this.data.accounts.length === 0
        }
      });

      if (addResult.result.success) {
        wx.showToast({
          title: addResult.result.isUpdate ? '更新成功' : '添加成功',
          icon: 'success'
        });
        this.hideAddModal();
        this.loadAccounts();
      } else {
        wx.showToast({
          title: addResult.result.message || '操作失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('操作账号失败:', error);
      wx.showToast({
        title: error.message || '操作失败',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
    }
  },

  onLocationInfo() {
    wx.navigateTo({
      url: '/pages/address/address'
    });
  },

  // 隐藏按钮连续点击10次跳转parody页面
  onSecretTap() {
    if (this.data.secretTapTimer) {
      clearTimeout(this.data.secretTapTimer);
    }
    this.setData({ secretTapCount: this.data.secretTapCount + 1 });
    if (this.data.secretTapCount >= 10) {
      this.setData({ secretTapCount: 0 });
      wx.navigateTo({ url: '/pages/parody/parody' });
    } else {
      // 2秒内未连续点击则重置
      this.data.secretTapTimer = setTimeout(() => {
        this.setData({ secretTapCount: 0 });
      }, 2000);
    }
  },

  async onRefreshAllAccounts() {
    this.setData({ refreshingAll: true });
    try {
      // 获取所有账户
      const { result } = await wx.cloud.callFunction({ name: 'getCredentials' });
      if (!result.success || !Array.isArray(result.data)) {
        throw new Error('获取账户失败');
      }
      const accounts = result.data;
      // 并发刷新所有账户
      const promises = accounts.map(account => {
        if (!account.username || !account.password) {
          return Promise.resolve({ username: account.username, name: account.name, success: false, message: '缺少信息' });
        }
        return wx.cloud.callFunction({
          name: 'loginUser',
          data: {
            username: account.username,
            password: account.password,
            isMainAccount: !!account.isMainAccount
          }
        }).then(res => ({
          username: account.username,
          name: account.name,
          success: res.result && res.result.success,
          message: res.result && res.result.success ? '成功' : (res.result && res.result.message) || '失败'
        })).catch(e => ({
          username: account.username,
          name: account.name,
          success: false,
          message: '异常'
        }));
      });
      const results = await Promise.all(promises);
      // 统计
      const successList = results.filter(r => r.success);
      const failList = results.filter(r => !r.success);
      wx.showModal({
        title: '刷新结果',
        content: `成功：${successList.length}  失败：${failList.length}\n成功账户：${successList.map(s => s.name || s.username).join('、') || '无'}\n${failList.length > 0 ? ('失败账户：' + failList.map(f => `${f.name || f.username}: ${f.message}`).join('、')) : '全部成功'}`,
        showCancel: false
      });
    } catch (e) {
      wx.showToast({ title: '刷新失败', icon: 'none' });
    } finally {
      this.setData({ refreshingAll: false });
    }
  },

  logout() {
    wx.removeStorageSync('userInfo');
    wx.removeStorageSync('loginTime');
    wx.redirectTo({ url: '/pages/login/login' });
  }
}); 
