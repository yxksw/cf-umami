# cf-umami

一个轻量级的网站浏览量统计系统，基于 Cloudflare Workers + D1 数据库构建。类似于 Umami，但更加简洁轻量，完全运行在 Cloudflare 边缘网络上。

## 特性

- 🚀 **轻量快速** - 基于 Cloudflare Workers，全球边缘部署
- 💾 **数据持久化** - 使用 Cloudflare D1 SQLite 数据库存储
- 🔒 **隐私友好** - 不收集用户敏感信息，仅记录页面浏览量
- 🌐 **CORS 支持** - 支持跨域请求，可追踪多个域名
- 📊 **简单查询** - 提供 API 接口查询任意路径的浏览量
- 🛡️ **安全验证** - 通过 Origin/Referer 验证请求来源

## 项目结构

```
.
├── src/
│   └── index.ts          # 主入口文件，包含所有路由逻辑
├── wrangler.jsonc        # Cloudflare Workers 配置文件
├── package.json          # 项目依赖
└── README.md            # 本文档
```

## 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) 18 或更高版本
- [Cloudflare](https://dash.cloudflare.com/) 账号
- 安装 Wrangler CLI：

```bash
npm install -g wrangler
```

### 1. 克隆项目

```bash
git clone <your-repo-url>
cd cf-umami
```

### 2. 安装依赖

```bash
npm install
```

### 3. 登录 Cloudflare

```bash
npx wrangler login
```

### 4. 创建 D1 数据库

```bash
npx wrangler d1 create cf-umami
```

创建成功后，会输出类似以下内容：

```
✅ Successfully created DB 'cf-umami'

[[d1_databases]]
binding = "cf_umami"
database_name = "cf-umami"
database_id = "your-database-id-here"
```

将输出的 `database_id` 更新到 `wrangler.jsonc` 文件中：

```json
"d1_databases": [
  {
    "binding": "cf_umami",
    "database_name": "cf-umami",
    "database_id": "your-database-id-here",
    "remote": false
  }
]
```

### 5. 配置追踪域名

编辑 `wrangler.jsonc`，将 `TRACKED_SITE_HOST` 修改为你需要统计的网站域名：

```json
"vars": {
  "TRACKED_SITE_HOST": "your-domain.com"
}
```

### 6. 本地开发测试

```bash
npm run dev
```

服务将在 `http://localhost:8787` 启动。

### 7. 部署到 Cloudflare

```bash
npm run deploy
```

部署成功后，会输出你的 Workers 域名，例如：

```
✨ Successfully deployed
   https://cf-umami.your-subdomain.workers.dev
```

## 使用方法

### 在网站中嵌入追踪代码

在你需要统计浏览量的网站 HTML 中，添加以下脚本：

```html
<script src="https://cf-umami.your-subdomain.workers.dev/tracker.js" defer></script>
```

将 `cf-umami.your-subdomain.workers.dev` 替换为你实际的 Workers 域名。

### 追踪脚本工作原理

追踪脚本会自动：

1. 监听页面加载事件，记录初始页面浏览
2. 监听 `history.pushState` / `history.replaceState`（SPA 路由变化）
3. 监听 `popstate` 事件（浏览器前进/后退）
4. 使用 `navigator.sendBeacon` 或 `fetch` 发送浏览数据

### 查询浏览量 API

#### 获取指定路径的浏览量

```http
GET /share?pathname=/your-path
```

**示例：**

```bash
curl "https://cf-umami.your-subdomain.workers.dev/share?pathname=/blog/hello-world"
```

**响应：**

```json
{
  "pathname": "/blog/hello-world",
  "views": 128
}
```

#### 在网页中显示浏览量

```javascript
// 获取当前页面的浏览量
async function showPageViews() {
  const pathname = location.pathname;
  const response = await fetch(
    `https://cf-umami.your-subdomain.workers.dev/share?pathname=${encodeURIComponent(pathname)}`
  );
  const data = await response.json();
  console.log(`本页面浏览量: ${data.views}`);
}

showPageViews();
```

## API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/tracker.js` | GET | 获取追踪脚本 |
| `/send` | POST | 接收页面浏览数据（由追踪脚本调用） |
| `/send` | OPTIONS | CORS 预检请求 |
| `/share` | GET | 查询指定路径的浏览量 |

## 配置说明

### wrangler.jsonc 配置项

```jsonc
{
  "name": "cf-umami",              // Workers 名称
  "main": "src/index.ts",          // 入口文件
  "compatibility_date": "2026-02-10",  // 兼容性日期
  "compatibility_flags": ["nodejs_compat"],  // Node.js 兼容模式

  "d1_databases": [
    {
      "binding": "cf_umami",       // 数据库绑定名称
      "database_name": "cf-umami", // D1 数据库名称
      "database_id": "xxx",        // D1 数据库 ID
      "remote": false
    }
  ],

  "vars": {
    "TRACKED_SITE_HOST": "your-domain.com"  // 允许追踪的域名
  }
}
```

## 数据库结构

系统使用单个表存储浏览量数据：

```sql
CREATE TABLE IF NOT EXISTS pageviews (
  pathname TEXT PRIMARY KEY,    -- 页面路径
  views INTEGER NOT NULL        -- 浏览次数
);
```

## 安全说明

- 系统通过 `Origin` 和 `Referer` 头部验证请求来源
- 只有来自 `TRACKED_SITE_HOST` 配置的域名的请求才会被记录
- 追踪脚本使用 CORS 模式发送请求
- 数据库操作使用参数化查询防止 SQL 注入

## 限制

- 路径名最大长度为 512 字符
- 仅统计页面浏览量，不包含用户行为分析
- 不支持实时统计，数据写入可能有短暂延迟

## 开发命令

```bash
# 本地开发
npm run dev

# 部署到 Cloudflare
npm run deploy

# 运行测试
npm run test

# 生成 Cloudflare 类型定义
npm run cf-typegen
```

## 技术栈

- [Cloudflare Workers](https://workers.cloudflare.com/) - 边缘计算平台
- [Cloudflare D1](https://developers.cloudflare.com/d1/) - 边缘 SQLite 数据库
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) - CLI 工具
- [TypeScript](https://www.typescriptlang.org/) - 类型安全的 JavaScript

## License

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！
