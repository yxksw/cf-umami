const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 配置文件路径
const JSON_FILE = path.join(__dirname, '..', 'pageviews.json');
const SQL_FILE = path.join(__dirname, '..', 'temp_migration.sql');
const DATABASE_NAME = 'cf-umami'; // wrangler.jsonc 中的 database_name

try {
  console.log('1. 读取 JSON 数据...');
  if (!fs.existsSync(JSON_FILE)) {
    throw new Error(`找不到文件: ${JSON_FILE}`);
  }
  const rawData = fs.readFileSync(JSON_FILE, 'utf8');
  const data = JSON.parse(rawData);
  console.log(`   找到 ${data.length} 条记录`);

  console.log('2. 生成 SQL 语句...');
  // 批量生成 UPSERT 语句
  // 注意：pageviews.json 里的字段是 pathname 和 pageviews
  // 数据库表 pageviews 里的字段是 pathname 和 views
  let sqlContent = '';
  
  data.forEach(item => {
    // 简单的 SQL 转义：将单引号替换为两个单引号
    const safePath = item.pathname.replace(/'/g, "''");
    const views = Number(item.pageviews) || 0;
    
    sqlContent += `INSERT INTO pageviews (pathname, views) VALUES ('${safePath}', ${views}) ON CONFLICT(pathname) DO UPDATE SET views = excluded.views;\n`;
  });
  
  fs.writeFileSync(SQL_FILE, sqlContent);
  console.log(`   SQL 文件已生成: ${SQL_FILE}`);

  console.log('3. 执行 D1 迁移 (Remote)...');
  // 执行 wrangler d1 execute
  // --remote 表示操作远程数据库（根据 wrangler.jsonc 配置）
  execSync(`npx wrangler d1 execute ${DATABASE_NAME} --remote --file=${SQL_FILE}`, { 
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });

  console.log('✅ 迁移完成！');

} catch (error) {
  console.error('❌ 错误:', error.message);
  process.exit(1);
} finally {
  // 清理临时文件
  if (fs.existsSync(SQL_FILE)) {
    console.log('4. 清理临时文件...');
    fs.unlinkSync(SQL_FILE);
  }
}
