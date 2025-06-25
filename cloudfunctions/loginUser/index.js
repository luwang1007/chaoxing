const cloud = require('wx-server-sdk');
const axios = require('axios');
const { CookieJar } = require('tough-cookie');

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});
const db = cloud.database();

// 确保集合存在
async function ensureCollectionExists(collectionName) {
  try {
    // 使用管理员权限创建集合
    const { result } = await cloud.callFunction({
      name: 'initDatabase',
      data: {
        action: 'createCollection',
        collectionName: collectionName
      }
    });

    if (!result.success) {
      throw new Error('创建集合失败: ' + result.message);
    }

    console.log(`创建集合 ${collectionName} 成功`);
  } catch (error) {
    console.error(`创建集合 ${collectionName} 失败:`, error);
    throw error;
  }
}

// 云函数入口函数
exports.main = async (event, context) => {
  const { username, password, isMainAccount = false } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  console.log('开始登录，用户信息:', { username, openid });
  console.log('event参数内容:', event);

  try {
    // 调用超星学习通登录 API
    console.log('调用登录 API');
    const loginResponse = await axios.get('https://passport2-api.chaoxing.com/v11/loginregister', {
      params: {
        'cx_xxt_passport': 'json',
        'roleSelect': 'true',
        'uname': username,
        'code': password,
        'loginType': '1'
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36'
      }
    });

    console.log('登录 API 响应:', loginResponse.data);

    if (!loginResponse.data.status) {
      throw new Error(loginResponse.data.mes || '登录失败');
    }

    // 处理 cookies
    const jar = new CookieJar();
    const cookies = loginResponse.headers['set-cookie'];
    if (cookies) {
      cookies.forEach(cookie => {
        try {
          jar.setCookieSync(cookie, 'https://mobilelearn.chaoxing.com');
        } catch (e) {
          console.error('设置 cookie 失败:', e);
        }
      });
    }

    // 处理 SSO 登录
    let name = username; // 默认使用username作为name
    let uid = null; // 初始化 uid
    if (loginResponse.data.url) {
      console.log('需要 SSO 登录，URL:', loginResponse.data.url);
      const ssoResponse = await axios.get(loginResponse.data.url, {
        params: {
          'uname': username,
          'code': password
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
          'Cookie': await jar.getCookieString('https://sso.chaoxing.com')
        }
      });
      console.log('SSO 登录响应:', ssoResponse.data);

      // 处理 SSO 登录的 cookies
      const ssoCookies = ssoResponse.headers['set-cookie'];
      if (ssoCookies) {
        ssoCookies.forEach(cookie => {
          try {
            jar.setCookieSync(cookie, 'https://sso.chaoxing.com');
          } catch (e) {
            console.error('设置 SSO cookie 失败:', e);
          }
        });
      }

      // 获取用户真实姓名和 uid
      if (ssoResponse.data && ssoResponse.data.msg) {
        name = ssoResponse.data.msg.name;
        uid = ssoResponse.data.msg.uid;
        console.log('获取到用户真实姓名:', name);
        console.log('获取到用户 uid:', uid);
      }
    }

    // 获取所有 cookies
    const cookieList = await jar.getCookies('https://mobilelearn.chaoxing.com');
    const formattedCookies = cookieList.map(cookie => `${cookie.key}=${cookie.value}`).join('; ');

    console.log('获取到的 cookies:', formattedCookies);

    if (!formattedCookies) {
      throw new Error('获取 cookies 失败');
    }

    // 验证 cookies 是否有效
    try {
      const verifyResponse = await axios.get('https://mooc1-api.chaoxing.com/mycourse/backclazzdata', {
        params: {
          'view': 'json',
          'rss': '1'
        },
        headers: {
          'Cookie': formattedCookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
          'Referer': 'https://mobilelearn.chaoxing.com/',
          'Origin': 'https://mobilelearn.chaoxing.com'
        }
      });
      console.log('验证 cookies 响应:', verifyResponse.data);
      if (!verifyResponse.data.result) {
        throw new Error('cookies 验证失败');
      }
    } catch (error) {
      console.error('验证 cookies 失败:', error);
      throw new Error('cookies 验证失败: ' + error.message);
    }

    // 加密密码
    const { result } = await cloud.callFunction({
      name: 'utils',
      data: {
        action: 'encrypt',
        text: password
      }
    });

    if (!result.success) {
      throw new Error('密码加密失败');
    }

    // 保存用户凭证
    // 先用 username 查找
    const { data: existingCredentials } = await db.collection('credentials')
      .where({ username: username })
      .get();

    let is555 = false;
    if (existingCredentials.length > 0 && typeof existingCredentials[0].is555 !== 'undefined') {
      is555 = existingCredentials[0].is555;
    }

    if (existingCredentials.length > 0) {
      // 已存在，更新账号
      const updateData = {
        password: result.data,
        cookies: cookieList,
        name: name,
        uid: uid,
        updateTime: db.serverDate(),
      };
      // 只有当明确要求设置为主账号时才更新 isMainAccount
      if (isMainAccount === true) {
        updateData.isMainAccount = true;
      }
      if (typeof is555 !== 'undefined') {
        updateData.is555 = is555;
      }
      await db.collection('credentials')
        .where({ username: username })
        .update({ data: updateData });
    } else {
      // 不存在，新增账号
      await db.collection('credentials').add({
        data: {
          username: username,
          password: result.data,
          cookies: cookieList,
          isMainAccount: isMainAccount,
          name: name,
          uid: uid,
          createTime: db.serverDate(),
          updateTime: db.serverDate(),
          is555: is555
        }
      });
    }

    return {
      success: true,
      cookies: cookieList,
      userInfo: {
        username,
        name: name,
        uid: uid,
        isMainAccount,
        is555
      }
    };
  } catch (error) {
    console.error('登录失败:', error);
    return {
      success: false,
      message: '登录失败: ' + error.message
    };
  }
}; 