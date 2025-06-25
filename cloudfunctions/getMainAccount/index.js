// 云函数入口文件
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  console.log('当前用户的 username:', event.username); // 更新调试信息

  try {
    // 获取主账号信息
    const { data: mainAccounts } = await db.collection('credentials')
      .where({ isMainAccount: true })
      .get()

    if (mainAccounts.length === 0) {
      return {
        success: false,
        message: '未找到主账号'
      }
    }

    const mainAccount = mainAccounts[0]

    // 解密密码
    const { result: decryptResult } = await cloud.callFunction({
      name: 'utils',
      data: {
        action: 'decrypt',
        text: mainAccount.password
      }
    });

    if (!decryptResult.success) {
      throw new Error('密码解密失败');
    }

    // 格式化 cookies
    const formattedCookies = mainAccount.cookies.reduce((acc, cookie) => {
      acc[cookie.key] = cookie.value;
      return acc;
    }, {});

    // 返回主账号信息，结构与登录时存储的 userInfo 相同
    return {
      success: true,
      message: '获取主账号成功',
      data: {
        username: mainAccount.username,
        password: decryptResult.data,  // 解密后的密码
        isMainAccount: true,
        cookies: formattedCookies  // 格式化后的 cookies 对象
      }
    };
  } catch (error) {
    console.error('获取主账号失败:', error);
    return {
      success: false,
      message: '获取主账号失败',
      data: null
    };
  }
} 