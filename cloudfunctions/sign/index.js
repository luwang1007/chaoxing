const cloud = require('wx-server-sdk')
const axios = require('axios')
const qs = require('qs')
const zlib = require('zlib')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 获取签到列表
async function getSignList(activePrimaryId, uid, headers) {
  try {
    const resp = await axios.get('https://luwang555.chat/newsign/signInList', {
      params: { activePrimaryId, uid },
      headers,
      validateStatus: () => true,
      responseType: 'text',
      decompress: true
    });

    return { 
      success: true, 
      data: resp.data,
      sessionId: extractSessionId(resp.headers)
    };
  } catch (error) {
    console.warn('获取签到列表失败:', { 
      error: { 
        name: error.name, 
        message: error.message, 
        stack: error.stack 
      }, 
      response: error.response ? { 
        status: error.response.status, 
        data: error.response.data 
      } : null 
    })
    return { 
      success: false, 
      message: error.message,
      sessionId: extractSessionId(error.response?.headers)
    };
  }
}

// 格式化 cookies
function formatCookies(cookies) {
  if (!cookies) return ''
  if (typeof cookies === 'string') return cookies
  if (Array.isArray(cookies)) {
    return cookies.map(cookie => {
      if (typeof cookie === 'string') return cookie
      if (cookie.key && cookie.value) return `${cookie.key}=${cookie.value}`
      return ''
    }).filter(Boolean).join('; ')
  }
  return ''
}

// 检查必要 Cookie 是否完整
function checkRequiredCookies(cookies) {
  const requiredCookies = ['_uid', 'fid', 'vc3', 'uf']
  const missingCookies = requiredCookies.filter(cookie => !cookies.includes(`${cookie}=`))
  if (missingCookies.length > 0) {
    throw new Error(`Cookie 不完整，缺少: ${missingCookies.join(', ')}，请重新登录`)
  }
}

// 生成随机设备信息
function generateDeviceInfo() {
  const devices = [
    'iPhone; CPU iPhone OS 14_0 like Mac OS X',
    'iPhone; CPU iPhone OS 15_0 like Mac OS X',
    'iPhone; CPU iPhone OS 16_0 like Mac OS X',
    'iPhone; CPU iPhone OS 17_0 like Mac OS X'
  ]
  const webviews = [
    'AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/7.0.20(0x17001427)',
    'AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.20(0x18001427)',
    'AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/9.0.20(0x19001427)'
  ]
  const screenSizes = [
    '390x844',
    '414x896',
    '428x926',
    '393x852'
  ]
  return {
    userAgent: `Mozilla/5.0 (${devices[Math.floor(Math.random() * devices.length)]}) ${webviews[Math.floor(Math.random() * webviews.length)]}`,
    deviceId: `wx_${Math.random().toString(36).substr(2, 15)}`,
    deviceName: `iPhone${Math.floor(Math.random() * 5) + 12}`,
    screenSize: screenSizes[Math.floor(Math.random() * screenSizes.length)],
    language: 'zh-CN',
    platform: 'iOS',
    webkitVersion: '605.1.15',
    osVersion: devices[Math.floor(Math.random() * devices.length)].split('OS ')[1].split(' ')[0]
  }
}

// 生成完整的请求头
function generateHeaders(cookies, deviceInfo, sessionId = null) {
  const headers = {
    'Cookie': cookies,
    'User-Agent': deviceInfo.userAgent,
    'Referer': 'https://mobilelearn.chaoxing.com/newsign/sign',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': `${deviceInfo.language},en;q=0.9`,
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Origin': 'https://mobilelearn.chaoxing.com'
  }

  if (sessionId) {
    headers['Cookie'] = `${cookies}; JSESSIONID=${sessionId}`
  }

  return headers
}

// 从响应头中提取 JSESSIONID
function extractSessionId(headers) {
  if (!headers['set-cookie']) return null
  const cookies = Array.isArray(headers['set-cookie']) ? headers['set-cookie'] : [headers['set-cookie']]
  for (const cookie of cookies) {
    const match = cookie.match(/JSESSIONID=([^;]+)/)
    if (match) return match[1]
  }
  return null
}

// 计算两点之间的距离（米）
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // 地球半径（米）
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * 云函数入口
 * @param {Object} event - { 
 *   activeId, courseId, classId, 
 *   type, objectId, longitude, latitude, 
 *   address, signCode, enc, name, 
 *   username, cookies, uid, signParams
 * }
 */
exports.main = async (event, context) => {
  const { activeId, courseId, classId, type, objectId, longitude, latitude, address, signCode, enc, name, username, cookies, uid, signParams } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    // 如果传入了signParams，直接复用
    if (signParams) {
      // 直接用signParams中的关键信息
      const {
        enc: cachedEnc,
        sessionId: cachedSessionId,
        preSignSessionId: cachedPreSignSessionId,
        longitude: cachedLng,
        latitude: cachedLat,
        address: cachedAddr
      } = signParams;
      // 构建签到参数
      const params = {
        activeId,
        uid,
        name: name || username || '',
        deviceCode: 'wx_batch',
        deviceName: 'iPhoneBatch',
        timestamp: Date.now(),
        screenSize: '390x844',
        osVersion: '14_0',
        webkitVersion: '605.1.15'
      };
      if (cachedLng && cachedLat) {
        params.longitude = cachedLng;
        params.latitude = cachedLat;
        params.address = cachedAddr || '';
      }
      if (cachedEnc) params.enc = cachedEnc;
      // 直接用sessionId
      const headers = generateHeaders(formatCookies(cookies), generateDeviceInfo(), cachedPreSignSessionId || cachedSessionId);
      try {
        const signUrl = 'https://luwang555.chat/pptSign/stuSignajax';
        const resp = await axios.get(signUrl, {
          params,
          headers,
          validateStatus: () => true,
          timeout: 15000,
          maxRedirects: 3,
          responseType: 'arraybuffer'
        });
        const signResult = resp.data.toString();
        const success = signResult.includes('success') && !signResult.includes('<html>') && !signResult.includes('签到失败');
        if (success) {
          return {
            success: true,
            message: '签到成功(批量参数)',
            name,
            username,
            location: type === 2 ? { longitude: cachedLng, latitude: cachedLat, address: cachedAddr } : undefined
          };
        } else {
          return {
            success: false,
            message: '签到失败: ' + signResult,
            name,
            username
          };
        }
      } catch (error) {
        return {
          success: false,
          message: error.message || '批量签到失败',
          name,
          username
        };
      }
    }

    // 记录接收到的位置信息
    console.log('云函数接收到的位置信息:', {
      类型: type,
      经度: longitude,
      纬度: latitude,
      地址: address,
      活动ID: activeId,
      课程ID: courseId,
      班级ID: classId
    });

    // 1. 检查参数
    if (!activeId) {
      return { success: false, message: '缺少活动ID' };
    }

    // 如果是位置签到，检查位置信息
    if (type === 2) {
      if (!longitude || !latitude) {
        console.error('位置签到缺少经纬度信息:', { longitude, latitude });
        return { success: false, message: '缺少位置信息' };
      }
      console.log('位置签到参数完整，准备进行签到');
    }

    // 2. 只采用 event 传入的参数，不再查数据库
    const finalCookies = cookies;
    const finalUid = uid;
    const finalName = name;

    if (!finalCookies || !finalUid) {
      return { success: false, message: '缺少必要的账号信息' };
    }

    const formattedCookies = formatCookies(finalCookies);
    const deviceInfo = generateDeviceInfo();

    // 4. 获取签到列表
    const listResult = await getSignList(activeId, finalUid, generateHeaders(formattedCookies, deviceInfo));
    if (!listResult.success) {
      return { success: false, message: listResult.message };
    }

    // 6. 执行正式签到
    const signUrl = 'https://luwang555.chat/pptSign/stuSignajax';
    const params = {
      activeId,
      uid: finalUid,
      name: finalName || username || '',
      deviceCode: deviceInfo.deviceId,
      deviceName: deviceInfo.deviceName,
      timestamp: Date.now(),
      screenSize: deviceInfo.screenSize,
      osVersion: deviceInfo.osVersion,
      webkitVersion: deviceInfo.webkitVersion
    };

    // 如果是位置签到，添加位置信息
    if (type === 2 && longitude && latitude) {
      console.log('添加位置信息到签到参数:', {
        经度: longitude,
        纬度: latitude,
        地址: address || '未知位置'
      });
      params.longitude = longitude;
      params.latitude = latitude;
      params.address = address || '未知位置';
    }

    // 如果是手势签到或签到码签到，添加 signCode
    if ((type === 3 || type === 5) && signCode) {
      params.signCode = signCode;
      console.log('添加 signCode 到签到参数:', signCode);
    }

    if (enc) params.enc = enc;
    // 生成headers时直接用getSignList的sessionId
    const headers = generateHeaders(formattedCookies, deviceInfo, listResult.sessionId);

    try {
      console.log('发送签到请求，完整参数:', {
        url: signUrl,
        params: {
          ...params,
          cookies: '***' // 隐藏敏感信息
        },
        headers: {
          ...headers,
          Cookie: '***' // 隐藏敏感信息
        }
      });

      await new Promise(resolve => setTimeout(resolve, Math.random() * 9 + 1));
      const resp = await axios.get(signUrl, {
        params,
        headers,
        validateStatus: () => true,
        timeout: 15000,
        maxRedirects: 3,
        responseType: 'arraybuffer'
      });
      const signResult = resp.data.toString();
      console.log('签到响应结果:', signResult);

      const success = signResult.includes('success') && !signResult.includes('<html>') && !signResult.includes('签到失败');
      if (success) {
        // 返回关键信息 signParams 供后续账号复用
        return {
          success: true,
          message: '签到成功',
          name: finalName,
          username: username,
          location: type === 2 ? { longitude, latitude, address } : undefined,
          signParams: {
            enc,
            sessionId: listResult.sessionId,
            preSignSessionId: listResult.sessionId,
            longitude,
            latitude,
            address
          }
        };
      } else {
        return { 
          success: false, 
          message: '签到失败: ' + signResult, 
          name: finalName, 
          username: username 
        };
      }
    } catch (error) {
      console.error('签到请求失败:', error);
      return { 
        success: false, 
        message: error.message || '签到失败', 
        name: finalName, 
        username: username 
      };
    }
  } catch (error) {
    console.error('云函数执行失败:', error);
    return { 
      success: false, 
      message: error.message || '签到失败', 
      name: name, 
      username: username 
    };
  }
};

// 检查 cookies 是否有效
function isValidCookies(cookies) {
  if (!cookies) return false;
  if (Array.isArray(cookies)) {
    return cookies.some(cookie => cookie.key === 'JSESSIONID' && cookie.value);
  }
  return typeof cookies === 'string' && cookies.includes('JSESSIONID=');
} 