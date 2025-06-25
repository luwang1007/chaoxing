App({
  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloud1-2gctia2z81071544', // 使用正确的云开发环境ID
        traceUser: true,
      });
    }

    // 检查更新
    this.checkUpdate();
  },

  checkUpdate: function () {
    if (wx.canIUse('getUpdateManager')) {
      const updateManager = wx.getUpdateManager();
      updateManager.onCheckForUpdate(res => {
        if (res.hasUpdate) {
          wx.showModal({
            title: '更新提示',
            content: '检测到新版本，是否下载新版本并重启小程序？',
            showCancel: false,
            confirmText: "确定更新",
            success: () => {
              wx.showLoading();
              updateManager.onUpdateReady(() => {
                wx.hideLoading();
                updateManager.applyUpdate();
              });
              updateManager.onUpdateFailed(() => {
                wx.showModal({
                  title: '更新失败',
                  content: '新版本已经上线，请重新打开小程序',
                });
              });
            }
          });
        }
      });
    }
  },

  globalData: {
    userInfo: null,
    isLoggedIn: false,
    mainAccount: null // 存储主账号信息
  }
}); 