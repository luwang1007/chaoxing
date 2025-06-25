const cloud = require('wx-server-sdk');

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { username, password, isMainAccount } = event;
  const usernameStr = String(username).trim();
  const nameStr = String(event.name || '').trim();

  try {
    // 查找账号用 username 和 name 共同作为唯一条件
    const { data } = await db.collection('credentials')
      .where({ username: usernameStr, name: nameStr })
      .get();

    // 如果设置为主账号，先将其他账号设为非主账号
    if (isMainAccount) {
      await db.collection('credentials')
        .where({ isMainAccount: true })
        .update({
          data: { isMainAccount: false }
        });
    }

    // 调用utils云函数加密密码
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

    if (data.length > 0) {
      // 账号已存在，直接更新
      await db.collection('credentials')
        .where({ username: usernameStr, name: nameStr })
        .update({
          data: {
            password: result.data,
            isMainAccount,
            mainAccountIdentifier: isMainAccount ? 'main' : null,
            updateTime: db.serverDate(),
            is555: typeof data[0].is555 !== 'undefined' ? data[0].is555 : false,
            name: nameStr
          }
        });
      return {
        success: true,
        message: '账号更新成功',
        isUpdate: true
      };
    } else {
      // 添加新账号
      await db.collection('credentials').add({
        data: {
          username: usernameStr,
          password: result.data,
          isMainAccount,
          mainAccountIdentifier: isMainAccount ? 'main' : null,
          updateTime: db.serverDate(),
          createTime: db.serverDate(),
          is555: false,
          name: nameStr
        }
      });
      return {
        success: true,
        message: '账号添加成功',
        isUpdate: false
      };
    }
  } catch (error) {
    console.error('操作凭证失败:', error);
    return {
      success: false,
      message: '操作失败'
    };
  }
}; 