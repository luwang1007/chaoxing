const cloud = require('wx-server-sdk');

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});
const db = cloud.database();

// 创建集合
async function createCollection(collectionName) {
  try {
    await db.createCollection(collectionName);
    console.log(`创建集合 ${collectionName} 成功`);
    return true;
  } catch (error) {
    // 如果集合已存在，返回true
    if (error.errCode === -501001) {
      console.log(`集合 ${collectionName} 已存在`);
      return true;
    }
    console.error(`创建集合 ${collectionName} 失败:`, error);
    return false;
  }
}

// 设置集合权限
async function setCollectionPermission(collectionName) {
  try {
    await db.collection(collectionName).setPermission({
      read: true,  // 所有用户可读
      write: false // 仅创建者可写
    });
    console.log(`设置集合 ${collectionName} 权限成功`);
    return true;
  } catch (error) {
    console.error(`设置集合 ${collectionName} 权限失败:`, error);
    return false;
  }
}

// 创建索引
async function createIndex(collectionName) {
  try {
    await db.collection(collectionName).createIndex({
      name: 'username_index',
      unique: true,
      keys: {
        username: 1
      }
    });
    console.log(`创建集合 ${collectionName} 索引成功`);
    return true;
  } catch (error) {
    // 如果索引已存在，返回true
    if (error.errCode === -501001) {
      console.log(`索引 ${collectionName} 已存在`);
      return true;
    }
    console.error(`创建集合 ${collectionName} 索引失败:`, error);
    return false;
  }
}

exports.main = async (event, context) => {
  try {
    const { action, collectionName } = event;

    // 如果指定了action和collectionName，只执行相应的操作
    if (action && collectionName) {
      switch (action) {
        case 'createCollection':
          const collectionCreated = await createCollection(collectionName);
          if (!collectionCreated) {
            throw new Error('创建集合失败');
          }
          return {
            success: true,
            message: '创建集合成功'
          };
        default:
          throw new Error('未知的操作类型');
      }
    }

    // 否则执行完整的初始化流程
    // 创建credentials集合
    const collectionCreated = await createCollection('credentials');
    if (!collectionCreated) {
      throw new Error('创建credentials集合失败');
    }

    // 设置credentials集合的权限
    const permissionSet = await setCollectionPermission('credentials');
    if (!permissionSet) {
      throw new Error('设置credentials集合权限失败');
    }

    // 创建索引
    const indexCreated = await createIndex('credentials');
    if (!indexCreated) {
      throw new Error('创建credentials集合索引失败');
    }

    return {
      success: true,
      message: '数据库初始化成功'
    };
  } catch (error) {
    console.error('数据库初始化失败:', error);
    return {
      success: false,
      message: '数据库初始化失败: ' + error.message
    };
  }
}; 