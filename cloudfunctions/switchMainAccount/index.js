const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const { username } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return {
      success: false,
      message: '未获取到用户信息'
    };
  }

  try {
    // 1. 检查账号是否存在
    const credential = await db.collection('credentials')
      .where({ username: username })
      .get();

    if (!credential.data || credential.data.length === 0) {
      return {
        success: false,
        message: '账号不存在'
      };
    }

    // 使用事务处理主账号状态更新
    const transaction = await db.startTransaction();
    try {
      // 2. 清除其他账号的主账号标记
      await transaction.collection('credentials')
        .where({ _id: db.command.neq(credential.data[0]._id) })
        .update({
          data: {
            isMainAccount: false,
            updateTime: db.serverDate()
          }
        });

      // 3. 设置新的主账号
      await transaction.collection('credentials')
        .where({
          _id: credential.data[0]._id
        })
        .update({
          data: {
            isMainAccount: true,
            updateTime: db.serverDate()
          }
        });

      // 提交事务
      await transaction.commit();

      return {
        success: true,
        message: '切换主账号成功'
      };
    } catch (error) {
      // 回滚事务
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('切换主账号失败:', error);
    return {
      success: false,
      message: '切换主账号失败'
    };
  }
}; 