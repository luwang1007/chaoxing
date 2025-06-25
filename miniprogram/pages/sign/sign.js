const app = getApp();
const API = require('../../utils/api');
const log = require('../../utils/log');
const util = require('../../utils/util');

// 新增：按名称生成 signMethod
function getSignMethodByName(name) {
  if (!name) return '';
  if (name.includes('签到码')) return '签到码签到';
  if (name.includes('二维码')) return '二维码签到';
  if (name.includes('手势')) return '手势签到';
  if (name.includes('位置')) return '位置签到';
  if (name.includes('普通')) return '普通签到';
  return name;
}

Page({
  data: {
    loading: false,
    hasMainAccount: false,
    signStatus: 'ready', // ready, scanning, success, failed
    signResult: null,
    activeCourses: [], // 有签到任务的课程列表
    stats: null, // 统计信息
    error: '', // 错误信息
    courses: [], // 课程列表
    username: '',
    password: '',
    longitude: '',
    latitude: '',
    address: '',
    signCode: '',
    enc: '',
    name: '',
    signAccountsResult: null,
    accounts: [],
    showGestureDrawer: false, // 手势弹窗初始为false
    warmingUp: false, // 是否正在预热
    warmupProgress: 0, // 预热进度
    warmupStatus: '', // 预热状态描述
    // 新增：签到进度条相关
    signingIn: false,
    signProgress: 0,
    signStatusText: ''
  },

  /**
   * 格式化时间戳为可读时间
   * @param {number} timestamp 时间戳
   * @returns {string} 格式化后的时间字符串
   */
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  },

  /**
   * 计算剩余时间（分钟）
   * @param {number} endTime 结束时间戳
   * @returns {number} 剩余分钟数
   */
  calculateTimeLeft(endTime) {
    const now = new Date().getTime();
    const end = new Date(endTime).getTime();
    return Math.max(0, Math.floor((end - now) / 1000 / 60));
  },

  async initMainAccount() {
    try {
      const mainAccountResult = await wx.cloud.callFunction({
        name: 'getMainAccount'
      });

      if (mainAccountResult.result.success) {
        const mainAccount = mainAccountResult.result.data;
        wx.setStorageSync('userInfo', mainAccount);
        app.globalData.mainAccount = {
          username: mainAccount.username,
          password: mainAccount.password
        };
      }
    } catch (error) {
      log.error('获取主账号失败:', error);
    }
  },

  onLoad() {
    this.loadAccounts();
    this.initAPI();
  },

  onShow() {
    this.initAPI();
  },

  /**
   * 初始化 API 实例
   * @returns {boolean} 是否初始化成功
   */
  async initAPI() {
    try {
      // 调用云函数获取主账号信息
      const mainAccountResult = await wx.cloud.callFunction({
        name: 'getMainAccount'
      });

      if (!mainAccountResult.result.success) {
        log.error('获取主账号失败:', mainAccountResult.result.message);
        this.setData({ 
          hasMainAccount: false,
          error: '获取主账号失败'
        });
        return false;
      }

      const mainAccount = mainAccountResult.result.data;
      
      // 更新全局主账号信息
      app.globalData.mainAccount = {
        username: mainAccount.username,
        password: mainAccount.password
      };

      // 更新页面状态和账号信息
      this.setData({
        hasMainAccount: true,
        username: mainAccount.username,
        password: mainAccount.password
      });

      // 直接使用云函数返回的数据初始化 API
      this.api = new API(mainAccount.username, mainAccount.password);
      this.api.cookies = mainAccount.cookies;
      this.api.updatetime = new Date().getTime();
      
      // 取消课程缓存逻辑，每次都拉取最新课程
      await this.loadCourses();
      return true;
    } catch (error) {
      log.error('初始化 API 失败:', error);
      this.setData({ 
        hasMainAccount: false,
        error: '初始化失败，请重试'
      });
      return false;
    }
  },

  /**
   * 加载课程列表
   */
  async loadCourses() {
    if (!this.data.hasMainAccount) {
      wx.showToast({
        title: '请先设置主账号',
        icon: 'none'
      });
      return;
    }

    this.setData({ loading: true, error: '' });

    try {
      console.log('开始获取课程列表');
      // 使用已初始化的API实例
      if (!this.api) {
        throw new Error('API未初始化');
      }
      const courses = await this.api.getCourse();
      
      if (!courses || courses.length === 0) {
        this.setData({
          courses: [],
          loading: false,
          error: '暂无课程'
        });
        return;
      }

      const processedCourses = courses.map(course => ({
        ...course,
        courseName: course.courseName || '未知课程',
        className: course.className || '未知班级',
        teacherName: course.teacherName || '未知教师'
      }));

      this.setData({
        courses: processedCourses,
        loading: false,
        error: ''
      });
    } catch (error) {
      log.error('加载课程失败:', error);
      this.setData({
        error: '获取课程失败: ' + (error.message || '未知错误'),
        loading: false
      });
    }
  },

  // 检查签到任务
  async checkSignTasks() {
    if (!this.data.courses || this.data.courses.length === 0) {
      wx.showToast({
        title: '请先加载课程',
        icon: 'none'
      })
      return
    }

    this.setData({
      loading: true,
      error: null,
      signStatus: 'scanning',
      warmingUp: false,
      warmupProgress: 0,
      warmupStatus: ''
    })

    try {
      const result = await this.api.checkSignTasks(this.data.courses)

      if (!result.success) {
        throw new Error(result.message || '检查签到任务失败')
      }

      // 检查数据结构
      if (!Array.isArray(result.data)) {
        throw new Error('返回的数据格式不正确')
      }
      
      // 处理活动数据，格式化时间，并按名称生成 signMethod
      const processedData = result.data.map(course => ({
        ...course,
        activities: course.activities.map(activity => ({
          ...activity,
          startTime: this.formatTime(activity.startTime),
          endTime: this.formatTime(activity.endTime),
          timeLeft: this.calculateTimeLeft(activity.endTime),
          signMethod: getSignMethodByName(activity.name)
        }))
      }))

      // 如果有签到任务，进行预热
      if (processedData.length > 0) {
        try {
          this.setData({
            warmingUp: true,
            warmupProgress: 0,
            warmupStatus: '正在初始化云函数...'
          });

          // 获取所有账号信息
          const accountsRes = await wx.cloud.callFunction({
            name: 'getCredentials'
          });
          const accounts = accountsRes.result.data || [];

          if (accounts.length > 0) {
            this.setData({
              warmupProgress: 30,
              warmupStatus: '正在建立安全连接...'
            });

            // 使用第一个签到任务进行预热
            const firstActivity = processedData[0].activities[0];
            let finished = 0;
            // 改为并发预热
            await Promise.all(accounts.map(account => {
              const warmupData = {
                activeId: firstActivity.id,
                courseId: firstActivity.courseId,
                classId: firstActivity.classId,
                username: account.username,
                cookies: account.cookies,
                uid: account.uid,
                name: account.name,
                warmup: true // 标记为预热请求
              };
              // 每个账号预热并发执行
              return wx.cloud.callFunction({
                name: 'sign',
                data: warmupData
              }).then(res => {
              }).finally(() => {
                finished++;
                this.setData({
                  warmupProgress: 30 + Math.floor((finished / accounts.length) * 70),
                  warmupStatus: `正在优化网络性能...（${finished}/${accounts.length}）`
                });
              });
            }));

            this.setData({
              warmupProgress: 100,
              warmupStatus: '预热完成，准备就绪'
            });
            // 预热完成后保存账号到本地（过滤字段）
            const filteredAccounts = accounts.map(acc => ({
              username: acc.username,
              cookies: acc.cookies,
              uid: acc.uid,
              name: acc.name
            }));
            
            wx.setStorageSync('sign_accounts', filteredAccounts);
        
            // 延迟500ms后隐藏预热状态
            setTimeout(() => {
              this.setData({
                warmingUp: false,
                warmupProgress: 0,
                warmupStatus: ''
              });
            }, 500);
          }
        } catch (error) {
          // 预热失败不影响主流程
          this.setData({
            warmingUp: false,
            warmupProgress: 0,
            warmupStatus: ''
          });
        }
      }
      
      // 更新状态
      if (processedData.length === 0) {
        this.setData({
          activeCourses: [],
          stats: result.stats,
          signStatus: 'ready',
          signResult: {
            message: '当前没有需要签到的任务'
          }
        })
        wx.showToast({
          title: '当前没有需要签到的任务',
          icon: 'none'
        })
      } else {
        this.setData({
          activeCourses: processedData,
          stats: result.stats,
          signStatus: 'success',
          signResult: {
            message: `发现 ${processedData.length} 个签到任务`
          }
        })
      }
    } catch (error) {
      this.setData({
        error: error.message || '检查签到任务失败',
        signStatus: 'failed',
        signResult: {
          message: error.message || '检查签到任务失败'
        },
        warmingUp: false,
        warmupProgress: 0,
        warmupStatus: ''
      })
      wx.showToast({
        title: error.message || '检查签到任务失败',
        icon: 'none'
      })
    } finally {
      this.setData({
        loading: false
      })
    }
  },

  // 重新检测
  resetSign() {
    this.setData({
      signStatus: 'ready',
      signResult: null,
      activeCourses: [],
      stats: null,
      signAccountsResult: null
    });
    // 新增：清空上次签到成功账号记录
    wx.removeStorageSync('sign_success_accounts');
  },

  // 跳转到账户管理页面
  goToCredentials() {
    wx.navigateTo({
      url: '/pages/credentials/credentials'
    });
  },

  // 批量顺序签到
  async batchSign(signData) {
    function cleanData(obj) {
      const result = {};
      Object.keys(obj).forEach(key => {
        if (obj[key] !== undefined && obj[key] !== null) {
          result[key] = obj[key];
        }
      });
      return result;
    }
    this.setData({ signingIn: true, signProgress: 0, signStatusText: '正在签到...' });
    const signStartTime = Date.now();
    try {
      let accounts = wx.getStorageSync('sign_accounts');
      if (!accounts || accounts.length === 0) {
        wx.showToast({ title: '请先检测签到任务', icon: 'none' });
        this.setData({ signingIn: false, signProgress: 0, signStatusText: '' });
        return;
      }
      // 过滤上次签到成功的账号，改为用 name 字段（如无则回退 username）
      const lastSuccessAccounts = wx.getStorageSync('sign_success_accounts') || [];
      accounts = accounts.filter(acc => !lastSuccessAccounts.includes(acc.name || acc.username));
      if (accounts.length === 0) {
        wx.showToast({ title: '所有账号已签到，无需重复签到', icon: 'none' });
        this.setData({ signingIn: false, signProgress: 0, signStatusText: '' });
        return;
      }
      const successAccounts = [];
      const failedAccounts = [];
      let finished = 0;
      const total = accounts.length;
      const updateProgress = () => {
        this.setData({
          signProgress: Math.floor((finished / total) * 100),
          signStatusText: `正在签到...（${finished}/${total}）`
        });
      };
      updateProgress();
      await Promise.all(accounts.map(async (account) => {
        try {
          let accountSignData = {
            ...signData,
            username: account.username,
            cookies: account.cookies,
            uid: account.uid,
            name: account.name
          };
          const cleanAccountSignData = cleanData(accountSignData);
          const res = await wx.cloud.callFunction({
            name: 'sign',
            data: cleanAccountSignData
          });
          if (res.result.success) {
            successAccounts.push(account.name || account.username);
          } else {
            failedAccounts.push(account.name || account.username);
          }
        } catch (error) {
          failedAccounts.push(account.name || account.username);
        } finally {
          finished++;
          updateProgress();
        }
      }));
      this.setData({
        signAccountsResult: {
          successAccounts,
          failedAccounts,
          timestamp: Date.now()
        },
        signingIn: false,
        signProgress: 0,
        signStatusText: ''
      });
      // 保存本次成功账号到本地，改为存 name（如无则回退 username）
      wx.setStorageSync('sign_success_accounts', successAccounts);
      const signEndTime = Date.now();
      wx.showToast({
        title: `成功: ${successAccounts.length} 失败: ${failedAccounts.length}`,
        icon: 'none',
        duration: 2000
      });
    } catch (error) {
      wx.showToast({
        title: '批量签到失败，请重试',
        icon: 'none',
        duration: 2000
      });
      this.setData({ signingIn: false, signProgress: 0, signStatusText: '' });
    }
  },

  // 处理手势签到
  inputGesture() {
    return new Promise((resolve, reject) => {
      this.setData({ showGestureDrawer: true });
      this.gestureResolve = resolve;
      this.gestureReject = reject;
    });
  },

  // 手势确认回调
  onGestureConfirm(e) {
    const { gesture } = e.detail;
    this.setData({ showGestureDrawer: false });
    if (this.gestureResolve) {
      this.gestureResolve(gesture);
    }
  },

  // 手势关闭回调
  onGestureClose() {
    this.setData({ showGestureDrawer: false });
    if (this.gestureReject) {
      this.gestureReject(new Error('手势绘制已取消'));
    }
  },

  onSignTap: async function(e) {
    const app = getApp()
    const activity = e.currentTarget.dataset.activity
    
    // 检查主账号信息
    if (!app.globalData.mainAccount || !app.globalData.mainAccount.username || !app.globalData.mainAccount.password) {
      wx.showToast({
        title: '请先设置主账号',
        icon: 'none'
      })
      return
    }

    // 检查活动信息
    if (!activity || !activity.id) {
      wx.showToast({
        title: '签到活动信息不完整',
        icon: 'none'
      })
      return
    }

    // 回退为直接字符串包含判断
    const isQRCodeSign = activity.name === '二维码签到' || activity.name.includes('二维码');
    const isSignCodeSign = activity.name === '签到码签到' || activity.name.includes('签到码');
    const isGestureSign = activity.name === '手势签到' || activity.name.includes('手势');
    const isLocationSign = activity.name === '位置签到' || activity.name.includes('位置');

    try {
      // 只在位置签到和二维码签到时传位置信息
      let signData = {
        activeId: activity.id,
        courseId: activity.courseId,
        classId: activity.classId,
        type: activity.type,
        objectId: activity.objectId,
        signCode: activity.signCode,
        enc: activity.enc,
        name: activity.name
      };
      if (isLocationSign || isQRCodeSign) {
        signData.longitude = activity.longitude;
        signData.latitude = activity.latitude;
        signData.address = activity.address;
      }

      // 处理二维码签到
      if (isQRCodeSign) {
        try {
          // 1. 扫描二维码
          const scanResult = await wx.scanCode({
            scanType: ['qrCode'],
            onlyFromCamera: true
          })
          
          if (!scanResult.result) {
            throw new Error('未获取到二维码内容')
          }

          // 2. 从二维码内容中提取 enc 参数
          const encMatch = scanResult.result.match(/enc=([^&]+)/)
          if (!encMatch) {
            throw new Error('二维码格式不正确')
          }
          signData.enc = encMatch[1]
        } catch (error) {
          wx.showToast({
            title: error.message || '获取二维码失败',
            icon: 'none'
          })
          return
        }
      }
      // 处理签到码签到
      else if (isSignCodeSign) {
        try {
          const signCode = await this.inputSignCode()
          signData.signCode = signCode
        } catch (error) {
          wx.showToast({
            title: error.message || '获取签到码失败',
            icon: 'none'
          })
          return
        }
      }
      // 处理手势签到
      else if (isGestureSign) {
        try {
          const gesture = await this.inputGesture()
          signData.signCode = gesture
        } catch (error) {
          wx.showToast({
            title: error.message || '获取手势失败',
            icon: 'none'
          })
          return
        }
      }
      // 处理位置签到
      else if (isLocationSign) {
        try {
          // 优先尝试获取主账号的地址信息
          const mainAccountRes = await wx.cloud.callFunction({
            name: 'getCredentials'
          });
          let mainAccount = null;
          if (mainAccountRes.result && mainAccountRes.result.data) {
            mainAccount = mainAccountRes.result.data.find(acc => acc.isMainAccount);
          }
          if (mainAccount && mainAccount.address && mainAccount.address.longitude && mainAccount.address.latitude) {
            // 直接用数据库中的地址
            signData.longitude = mainAccount.address.longitude;
            signData.latitude = mainAccount.address.latitude;
            signData.address = mainAccount.address.address || mainAccount.address.name;
          } else {
            // 没有则弹出地图让用户选择
            const locationRes = await wx.chooseLocation();
            const baiduLocation = await this.getBaiduLocation(locationRes.longitude, locationRes.latitude);
            signData.longitude = baiduLocation.lng;
            signData.latitude = baiduLocation.lat;
            signData.address = locationRes.address || locationRes.name;
          }
        } catch (error) {
          wx.showToast({
            title: '签到失败',
            icon: 'none'
          });
          return;
        }
      }

      this.batchSign(signData);
    } catch (error) {
      wx.showToast({
        title: '签到失败，请重试',
        icon: 'none'
      })
    }
  },

  chooseLocation() {
    return new Promise((resolve, reject) => {
      console.log('开始选择位置');
      wx.chooseLocation({
        success: res => {
          if (!res.longitude || !res.latitude) {
            reject(new Error('位置信息不完整'));
            return;
          }
          resolve({
            longitude: res.longitude,
            latitude: res.latitude,
            address: res.address || res.name || '未知位置'
          });
        },
        fail: err => {
          reject(new Error('未选择位置: ' + (err.errMsg || '未知错误')));
        }
      });
    });
  },

  scanQRCode() {
    return new Promise((resolve, reject) => {
      wx.scanCode({
        onlyFromCamera: true,
        scanType: ['qrCode'],
        success: res => {
          const match = res.result.match(/enc=([\w\d]+)/);
          if (match) {
            resolve(match[1]);
          } else {
            reject(new Error('二维码内容无效'));
          }
        },
        fail: err => reject(new Error('扫码失败'))
      });
    });
  },

  inputSignCode() {
    return new Promise((resolve, reject) => {
      wx.showModal({
        title: '请输入签到码',
        editable: true,
        placeholderText: '请输入签到码',
        success: res => {
          if (res.confirm && res.content) {
            resolve(res.content);
          } else {
            reject(new Error('未输入签到码'));
          }
        },
        fail: err => reject(new Error('未输入签到码'))
      });
    });
  },

  // 处理签到结果
  handleSignResult(result) {
    if (result.result.success) {
      this.setData({
        signAccountsResult: {
          successAccounts: result.result.successAccounts || [],
          failedAccounts: result.result.failedAccounts || []
        }
      });
    } else {
      wx.showToast({
        title: result.result.message || '签到失败',
        icon: 'none',
        duration: 2000
      });
    }
  },

  // 拉取所有账号列表
  async loadAccounts() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getCredentials' // 你需要有这样一个云函数，返回所有账号
      });
      if (res.result && Array.isArray(res.result.data)) {
        this.setData({ accounts: res.result.data });
      } else {
        this.setData({ accounts: [] });
      }
    } catch (e) {
      wx.showToast({ title: '账号加载失败', icon: 'none' });
      this.setData({ accounts: [] });
    }
  },

  // 获取百度地图位置信息
  getBaiduLocation(longitude, latitude) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: 'https://api.map.baidu.com/geoconv/v1/',
        data: {
          coords: `${longitude},${latitude}`,
          from: 1,  // 从WGS84坐标系转换
          to: 5,    // 转换到BD09坐标系
          ak: '6EWpcBgctoQPcG8SNaOZzWMCbTifvb06'
        },
        success: (res) => {
          if (res.data && res.data.status === 0 && res.data.result && res.data.result.length > 0) {
            resolve({
              lng: res.data.result[0].x,
              lat: res.data.result[0].y
            });
          } else {
            reject(new Error('百度地图坐标转换失败'));
          }
        },
        fail: (error) => {
          reject(error);
        }
      });
    });
  }
}); 