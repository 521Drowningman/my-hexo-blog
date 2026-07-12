# Hexo 博客自动化部署指南

本文把“Git 流水线与生产部署实践”转换成适合本项目的自动部署流程。

原文章使用的是：

```text
GitHub Actions -> 构建 Docker 镜像 -> 阿里云 ACR -> SSH -> Docker Compose
```

本项目是纯静态 Hexo 博客，不需要数据库、Docker、ACR，因此采用：

```text
push main
  -> GitHub Actions 安装依赖并构建 Hexo
  -> 保存不可变的 public/ 构建产物
  -> SSH 上传到服务器 releases/<commit-sha>
  -> 原子切换 current 软链接
  -> 从公网检查博客
  -> 失败时切回 previous
```

## 一、什么是 Git 流水线

Git 流水线是由 Git 事件自动触发的一组可重复步骤。例如向 `main` 分支执行 `git push` 后，GitHub Actions 自动完成构建和部署。

这个流程分为两部分：

- CI（持续集成）：检出源码、安装锁定依赖、执行 Hexo 构建、验证输出。
- CD（持续交付/部署）：把 CI 产生的同一份静态文件上传到生产服务器并切换上线。

关键点不是“省去几条命令”，而是每次上线都走相同流程，有日志、可验证、可回滚。

## 二、什么是生产部署实践

生产部署指真正影响访客所见网站的上线过程。相较于本地测试，至少需要考虑：

1. **可重复**：服务器不临时安装依赖或手工改生成文件。
2. **产物唯一**：一个 Git commit 对应一个发布目录。
3. **密钥隔离**：服务器私钥放 GitHub Secrets，不进入仓库。
4. **最小权限**：CI 使用专门的 `deploy` 用户，只能写部署目录。
5. **串行发布**：同一时间只允许一个生产部署，防止两个版本互相覆盖。
6. **原子切换**：先完整上传新版本，再一次性切换软链接，避免用户看到半个新站点。
7. **健康检查**：切换后从公网确认网站可以访问。
8. **回滚**：新版本失败时立即恢复上一个完整版本。
9. **可观察**：GitHub Actions 保留每一步日志和本次 commit。

本仓库的 `.github/workflows/deploy.yml`、`deploy/remote-deploy.sh` 和 `deploy/remote-rollback.sh` 实现了这些原则。

## 三、部署前准备

假定现在的 Nginx 网站根目录是：

```text
/www/wwwroot/hexo-blog
```

新的自动部署目录使用：

```text
/www/wwwroot/hexo-blog-deploy
├── current -> releases/<当前 commit>
├── previous -> releases/<上一个 commit>
├── incoming/
└── releases/
```

Nginx 最终读取：

```text
/www/wwwroot/hexo-blog-deploy/current
```

### 1. 创建专用部署用户

通过阿里云控制台或当前管理员 SSH 会话登录服务器，然后执行：

```bash
sudo useradd --create-home --shell /bin/bash deploy
sudo install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
sudo install -d -m 755 -o deploy -g deploy /www/wwwroot/hexo-blog-deploy
sudo install -d -m 755 -o deploy -g deploy /www/wwwroot/hexo-blog-deploy/incoming
sudo install -d -m 755 -o deploy -g deploy /www/wwwroot/hexo-blog-deploy/releases
```

说明：GitHub Actions 不使用 `root`，也不需要 `sudo`。`deploy` 用户只需要拥有 `hexo-blog-deploy` 目录。

### 2. 生成独立 SSH 密钥

在你信任的 Mac 或 Windows 电脑上生成一对只用于博客部署的密钥：

```bash
ssh-keygen -t ed25519 -C "github-actions-hexo" -f ~/.ssh/hexo_github_actions
```

它会产生：

```text
~/.ssh/hexo_github_actions       # 私钥，只放 GitHub Secret
~/.ssh/hexo_github_actions.pub   # 公钥，放服务器
```

把 `.pub` 文件中的整行内容追加到服务器：

```text
/home/deploy/.ssh/authorized_keys
```

然后在服务器执行：

```bash
sudo chown deploy:deploy /home/deploy/.ssh/authorized_keys
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

验证：

```bash
ssh -i ~/.ssh/hexo_github_actions deploy@你的服务器域名
```

验证成功后退出，不要把私钥提交到 Git。

### 3. 初始化第一个发布版本

先把当前在线网站复制为 `bootstrap` 版本：

```bash
sudo -u deploy mkdir -p /www/wwwroot/hexo-blog-deploy/releases/bootstrap
sudo rsync -a /www/wwwroot/hexo-blog/ /www/wwwroot/hexo-blog-deploy/releases/bootstrap/
sudo -u deploy ln -s /www/wwwroot/hexo-blog-deploy/releases/bootstrap /www/wwwroot/hexo-blog-deploy/current
```

确认：

```bash
test -f /www/wwwroot/hexo-blog-deploy/current/index.html
```

说明：这一步让切换 Nginx 根目录时网站内容保持不变，也为第一次自动发布准备了明确的 `current`。

### 4. 修改 Nginx 网站根目录

在宝塔面板中进入：

```text
网站 -> 你的站点 -> 设置 -> 网站目录
```

将运行目录改成：

```text
/www/wwwroot/hexo-blog-deploy/current
```

保存后重新加载 Nginx，并访问博客确认内容正常。

不要删除原来的 `/www/wwwroot/hexo-blog`。等自动部署稳定运行一段时间后，再自行决定是否保留。

## 四、配置 GitHub Secrets 和 Variables

进入 GitHub 仓库：

```text
Settings -> Secrets and variables -> Actions
```

在 **Secrets** 中添加：

| 名称 | 内容 |
| --- | --- |
| `PROD_SSH_HOST` | 服务器域名或公网 IP |
| `PROD_SSH_USER` | `deploy` |
| `PROD_SSH_PORT` | SSH 端口，例如 `22` |
| `PROD_SSH_PRIVATE_KEY` | `hexo_github_actions` 私钥的完整内容 |
| `PROD_SSH_KNOWN_HOSTS` | 服务器 SSH 主机公钥记录 |

在 **Variables** 中添加：

| 名称 | 内容 |
| --- | --- |
| `PROD_DEPLOY_BASE` | `/www/wwwroot/hexo-blog-deploy` |
| `PROD_HEALTHCHECK_URL` | 博客 HTTPS 首页，例如 `https://example.com/` |

### 为什么要配置 known_hosts

工作流启用了 `StrictHostKeyChecking=yes`，用于确认连接的是你的服务器，而不是中间人伪造的服务器。

在可信电脑上取得记录：

```bash
ssh-keyscan -p 22 你的服务器域名
```

在服务器控制台中查看真实指纹：

```bash
sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

先核对指纹，再把 `ssh-keyscan` 输出的完整记录保存为 `PROD_SSH_KNOWN_HOSTS`。只运行 `ssh-keyscan` 而不核对指纹，不能防止中间人攻击。

## 五、配置 production Environment

进入：

```text
Settings -> Environments -> New environment -> production
```

可以按需要启用人工审批。工作流中的 `deploy` job 使用该 Environment，所以构建完成后会先经过生产环境规则。

个人博客如果希望 `main` 每次 push 都自动上线，可以不启用审批；如果希望先看构建结果再发布，就启用审批。

## 六、第一次运行

建议先手动触发：

```text
GitHub -> Actions -> Build and deploy Hexo blog -> Run workflow
```

流水线会依次执行：

1. `npm ci`：严格使用 `package-lock.json` 中锁定的版本。
2. `npm run clean && npm run build`：生成静态文件。
3. 检查 `public/index.html`：避免把空目录部署上线。
4. 上传 artifact：构建和部署之间传递同一份不可变产物。
5. 将压缩包上传到服务器 `incoming/`。
6. 解压到 `releases/<完整 commit SHA>/`。
7. 把旧 `current` 记录为 `previous`。
8. 原子地把 `current` 指向新版本。
9. 请求 `PROD_HEALTHCHECK_URL`。
10. 如果连续检查失败，自动执行回滚并让流水线失败。

成功后检查服务器：

```bash
readlink -f /www/wwwroot/hexo-blog-deploy/current
readlink -f /www/wwwroot/hexo-blog-deploy/previous
```

## 七、日常发布流程

以后在任意电脑写文章：

```bash
git pull --rebase
git add source/_posts source/images
git commit -m "发布新文章"
git push origin main
```

`main` 收到 push 后会自动部署。服务器不再需要运行：

```text
git pull
npm install
hexo generate
```

构建只发生在 GitHub Actions，生产服务器只接收已经构建好的静态文件。

## 八、手动回滚

如果网站上线后发现内容错误，可以在本机读取仓库中的回滚脚本并通过 SSH 执行：

```bash
ssh -i ~/.ssh/hexo_github_actions deploy@你的服务器域名 \
  "bash -s -- /www/wwwroot/hexo-blog-deploy" \
  < deploy/remote-rollback.sh
```

该脚本会交换 `current` 和 `previous`，所以再执行一次可以切回刚才的版本。

内容写错但网站仍返回 HTTP 200 时，健康检查无法判断内容是否正确。这种情况需要人工检查后回滚，或者修复文章并再次 push。

## 九、与参考文章的对应关系

| 参考文章的容器项目 | 本 Hexo 项目 |
| --- | --- |
| 路径过滤 | 博客较小，每次统一构建，逻辑更简单 |
| Docker 镜像 | `public/` 静态文件 artifact |
| ACR/GHCR 镜像仓库 | GitHub Actions artifact 临时保存 |
| 镜像 SHA tag | `releases/<github.sha>` 发布目录 |
| SSH + Docker Compose | SSH + tar 解压 + 软链接切换 |
| 容器健康检查 | 公网 HTTPS 首页检查 |
| 重新创建容器 | 原子替换 `current` 软链接 |
| 镜像回滚 | `current`/`previous` 交换 |
| 数据库初始化 | Hexo 无数据库，因此不需要 |

## 十、后续生产改进

- 给 `deploy` 用户设置只允许公钥登录，禁用密码登录。
- 在阿里云安全组中限制 SSH；GitHub 托管 Runner IP 会变化，无法简单写死单个 IP。
- 定期清理很久以前的 `releases/`，但始终保留 `current` 和 `previous` 指向的版本。
- 将真正的博客域名写入 Hexo `_config.yml` 的 `url`，避免 canonical URL 和分享链接错误。
- 给 `main` 分支配置保护规则，让构建成功后才能合并。
- 后续可增加 Markdown 链接检查、图片大小检查和 HTML 验证作为 CI 质量门禁。
