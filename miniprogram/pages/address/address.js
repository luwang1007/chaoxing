Page({
  data: {
    accounts: []
  },
  onLoad() {
    this.loadAccounts();
  },
  loadAccounts() {
    wx.cloud.callFunction({
      name: 'getCredentials'
    }).then(res => {
      console.log('getCredentials返回：', res);
      if (res.result && res.result.data) {
        this.setData({ accounts: res.result.data });
      }
    }).catch(err => {
      console.error('云函数调用失败', err);
    });
  },
  async onEditAddress(e) {
    const username = e.currentTarget.dataset.username;
    wx.chooseLocation({
      success: (locationRes) => {
        wx.request({
          url: 'https://api.map.baidu.com/geoconv/v1/',
          data: {
            coords: `${locationRes.longitude},${locationRes.latitude}`,
            from: 1,
            to: 5,
            ak: '6EWpcBgctoQPcG8SNaOZzWMCbTifvb06'
          },
          success: (res) => {
            if (res.data && res.data.status === 0 && res.data.result && res.data.result.length > 0) {
              const baiduLoc = res.data.result[0];
              wx.cloud.callFunction({
                name: 'updateCredential',
                data: {
                  username,
                  address: {
                    name: locationRes.name,
                    address: locationRes.address,
                    longitude: baiduLoc.x,
                    latitude: baiduLoc.y
                  }
                }
              }).then(() => {
                wx.showToast({ title: '地址已更新', icon: 'success' });
                this.loadAccounts();
              });
            } else {
              wx.showToast({ title: '坐标转换失败', icon: 'none' });
            }
          },
          fail: () => {
            wx.showToast({ title: '坐标转换失败', icon: 'none' });
          }
        });
      },
      fail: () => {
        wx.showToast({ title: '未选择位置', icon: 'none' });
      }
    });
  }
}); 