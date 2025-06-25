const formatTime = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return `${[year, month, day].map(formatNumber).join('/')} ${[hour, minute, second].map(formatNumber).join(':')}`
}

const formatNumber = n => {
  n = n.toString()
  return n[1] ? n : `0${n}`
}

/**
 * 显示加载提示
 * @param {string} title 提示文字
 */
const showLoading = (title = '加载中') => {
  wx.showLoading({
    title,
    mask: true
  });
};

/**
 * 隐藏加载提示
 */
const hideLoading = () => {
  wx.hideLoading();
};

/**
 * 显示提示信息
 * @param {string} title 提示文字
 * @param {string} icon 图标类型
 */
const showToast = (title, icon = 'none') => {
  wx.showToast({
    title,
    icon,
    duration: 2000
  });
};

/**
 * 获取本地存储
 * @param {string} key 键名
 * @param {*} defaultValue 默认值
 */
const getStorage = (key, defaultValue = null) => {
  try {
    const value = wx.getStorageSync(key);
    return value || defaultValue;
  } catch (e) {
    console.error('获取存储失败:', e);
    return defaultValue;
  }
};

/**
 * 设置本地存储
 * @param {string} key 键名
 * @param {*} value 值
 */
const setStorage = (key, value) => {
  try {
    wx.setStorageSync(key, value);
    return true;
  } catch (e) {
    console.error('设置存储失败:', e);
    return false;
  }
};

/**
 * 移除本地存储
 * @param {string} key 键名
 */
const removeStorage = (key) => {
  try {
    wx.removeStorageSync(key);
    return true;
  } catch (e) {
    console.error('移除存储失败:', e);
    return false;
  }
};

/**
 * 清除所有本地存储
 */
const clearStorage = () => {
  try {
    wx.clearStorageSync();
    return true;
  } catch (e) {
    console.error('清除存储失败:', e);
    return false;
  }
};

/**
 * 解析Set-Cookie字符串为cookie对象
 * @param {string|string[]} setCookie Set-Cookie字符串或数组
 * @returns {object} cookie对象
 */
const parseCookies = (setCookie) => {
  const cookies = {};
  
  if (!setCookie) return cookies;
  
  const cookieArray = Array.isArray(setCookie) ? setCookie : [setCookie];
  
  cookieArray.forEach(cookie => {
    try {
      // 处理多个cookie的情况
      const cookieParts = cookie.split(',');
      cookieParts.forEach(part => {
        const [keyValue] = part.split(';');
        if (!keyValue) return;

        const [key, value] = keyValue.split('=').map(s => s.trim());
        if (key && value) {
          // 处理URL编码的值
          try {
            cookies[key] = decodeURIComponent(value);
          } catch (e) {
            cookies[key] = value;
          }
        }
      });
    } catch (e) {
      console.error('解析cookie失败:', e, cookie);
    }
  });
  
  return cookies;
};

/**
 * 将cookie对象转换为cookie字符串
 * @param {object} cookies cookie对象
 * @returns {string} cookie字符串
 */
const stringifyCookies = (cookies) => {
  if (!cookies || typeof cookies !== 'object') return '';
  
  return Object.entries(cookies)
    .filter(([key, value]) => {
      // 过滤掉无效的cookie
      if (!key || value === undefined || value === null) return false;
      // 过滤掉过期的cookie
      if (value === 'deleted' || value === '') return false;
      return true;
    })
    .map(([key, value]) => {
      // 对值进行URL编码
      try {
        return `${key}=${encodeURIComponent(value)}`;
      } catch (e) {
        return `${key}=${value}`;
      }
    })
    .join('; ');
};

/**
 * 合并多个cookie对象
 * @param {...object} cookieObjects cookie对象列表
 * @returns {object} 合并后的cookie对象
 */
const mergeCookies = (...cookieObjects) => {
  const merged = {};
  
  cookieObjects.forEach(cookies => {
    if (!cookies || typeof cookies !== 'object') return;
    
    Object.entries(cookies).forEach(([key, value]) => {
      // 只保留有效的cookie
      if (key && value !== undefined && value !== null && value !== 'deleted' && value !== '') {
        merged[key] = value;
      }
    });
  });
  
  return merged;
};

/**
 * 检查cookie是否有效
 * @param {object} cookies cookie对象
 * @returns {boolean} 是否有效
 */
const isValidCookies = (cookies) => {
  if (!cookies || typeof cookies !== 'object') return false;
  
  // 检查必要的cookie是否存在
  const requiredCookies = ['JSESSIONID', 'uid', '_uid'];
  return requiredCookies.some(key => cookies[key]);
};

/**
 * 获取用户相关的存储key
 * @param {string} username 用户名
 * @param {string} key 键名
 * @returns {string} 完整的存储key
 */
const getUserStorageKey = (username, key) => {
  return `user_${username}_${key}`;
};

module.exports = {
  formatTime,
  formatNumber,
  showLoading,
  hideLoading,
  showToast,
  getStorage,
  setStorage,
  removeStorage,
  clearStorage,
  parseCookies,
  stringifyCookies,
  mergeCookies,
  getUserStorageKey,
  isValidCookies
} 