// 云函数入口文件
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    // 获取所有凭证（不加 openid 条件，实现全员可见）
    const { data } = await db.collection('credentials').get();

    // 检查主账号一致性
    const mainAccounts = data.filter(acc => acc.isMainAccount);
    if (mainAccounts.length > 1) {
      console.log('检测到多个主账号，进行修复...');
      // 按更新时间排序，保留最新的主账号
      mainAccounts.sort((a, b) => b.updateTime - a.updateTime);
      
      // 将其他主账号设置为非主账号
      for (let i = 1; i < mainAccounts.length; i++) {
        await db.collection('credentials')
          .where({
            _openid: openid,
            username: mainAccounts[i].username
          })
          .update({
            data: {
              isMainAccount: false,
              mainAccountIdentifier: null
            }
          });
      }
      
      // 更新本地数据，确保返回正确的状态
      data.forEach(acc => {
        if (acc.username !== mainAccounts[0].username) {
          acc.isMainAccount = false;
          acc.mainAccountIdentifier = null;
        }
      });
    }

    // 解密密码
    const credentials = await Promise.all(data.map(async (credential) => {
      const { result } = await cloud.callFunction({
        name: 'utils',
        data: {
          action: 'decrypt',
          text: credential.password
        }
      });

      if (!result.success) {
        throw new Error('密码解密失败');
      }

      return {
        ...credential,
        password: result.data
      };
    }));

    return {
      success: true,
      data: credentials
    };
  } catch (error) {
    console.error('获取凭证失败:', error);
    return {
      success: false,
      message: '获取凭证失败'
    };
  }
} 