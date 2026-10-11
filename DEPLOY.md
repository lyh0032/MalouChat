## 阿里云部署

### Docker Compose 一键部署

在项目根目录执行：

```bash
docker compose up -d --build
```

这会：
1. 构建 `server` 镜像（编译 TypeScript → 生成 Prisma Client → 运行）
2. 构建 `web` 镜像（编译 Vue → Nginx 托管静态文件）
3. 启动两个容器：server（:5172）+ web（:80）
4. Nginx 将 `/api` 和 `/health` 反向代理到 server

### 部署到阿里云 ECS

1. 购买一台 ECS（Ubuntu 22.04，2 核 4GB 足够）

2. 安装 Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo systemctl enable docker
```

3. 将项目上传到服务器（任选一种）

```bash
# 方式 A：git clone
git clone https://your-repo-url.git
cd my-agent

# 方式 B：本地压缩上传
scp -r . ubuntu@你的服务器IP:/home/ubuntu/my-agent
```

4. 配置环境变量

```bash
cd my-agent/server
vim .env
```

填入你的配置（数据库、JWT、DashScope、Cloudflare R2 等）

5. 启动

```bash
cd my-agent
docker compose up -d --build
```

6. 开放安全组

在阿里云 ECS 控制台 → 安全组 → 添加入方向规则：
- 端口 80（HTTP）
- 端口 443（HTTPS，如果要配域名）

7. 访问 `http://你的服务器IP` 即可

### 可选：配置域名 + HTTPS（推荐）

```bash
# 安装 Nginx（作为反向代理处理 SSL）
sudo apt install nginx certbot python3-certbot-nginx

# 配置 Nginx
sudo vim /etc/nginx/sites-enabled/my-agent
```

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# 申请 SSL 证书
sudo certbot --nginx -d your-domain.com
```

这样就通过 `https://your-domain.com` 访问了。

### 常用命令

```bash
# 启动
docker compose up -d

# 重新构建后启动（代码有改动时）
docker compose up -d --build

# 查看日志
docker compose logs -f

# 停止
docker compose down

# 重启单个服务
docker compose restart web
```
