# 部署到 GitHub Pages（开土记录网页端）

本仓库已配好 GitHub Actions，推送 `main` 分支即自动构建并发布到 GitHub Pages。
发布后手机 / 平板 / 电脑浏览器都能打开同一个网址使用。

> 注意：本方案**只解决"随处可打开"**，数据仍保存在每台设备各自的浏览器本地存储中，
> 并不会跨设备自动同步。需要同步请另接共享后端（如 Supabase）。

## 一、前置条件

- 一个 GitHub 账号（https://github.com ）。
- 本仓库已 `git init` 并提交（当前在 `master` 分支）。

## 二、在 GitHub 新建仓库

1. 打开 https://github.com/new 。
2. 仓库名随意，例如 `kaitu-app`（部署地址会是 `https://<用户名>.github.io/kaitu-app/`）。
3. **不要**勾选 "Add a README file" / "Add .gitignore" / "Choose a license"——
   因为本地已经有完整代码，勾了会导致首次 push 冲突。
4. 点 "Create repository"。

## 三、本地推送

把下面 `<用户名>` 和 `<仓库名>` 换成你自己的，在 `kaitu-app` 目录执行：

```bash
# 把本地 master 改名为 GitHub 约定的 main
git branch -m master main

# 关联远程仓库
git remote add origin https://github.com/<用户名>/<仓库名>.git

# 推送（首次会让你在浏览器登录 GitHub 授权）
git push -u origin main
```

推送成功后会**自动触发**一次部署（仓库 Actions 标签页可见进度）。

## 四、开启 GitHub Pages

1. 进入仓库 **Settings → Pages**。
2. 在 "Build and deployment" 下，**Source** 选择 **GitHub Actions**。
3. 等待 Actions 跑完（约 1–2 分钟），页面会显示已发布地址：
   `https://<用户名>.github.io/<仓库名>/`

## 五、使用

- 手机 / 电脑浏览器打开上面的地址即可使用开土记录。
- 因为是 **HTTPS**，浏览器菜单「添加到主屏幕」即可像 App 一样全屏打开（PWA 已配好）。
- 改了代码后：正常 `git add` / `git commit` / `git push`，会自动重新部署。

## 六、常见调整

- **换仓库名**：无需改任何配置，`--base` 在构建时自动取当前仓库名。
- **用用户页（根路径）**：若把仓库命名为 `<用户名>.github.io`，
  需把 `.github/workflows/deploy.yml` 里
  `npm run build -- --base=/${{ github.event.repository.name }}/`
  改为 `npm run build -- --base=/`，否则资源会 404。
- **本地预览构建产物**：`npm run build` 后 `npm run preview`（默认 `http://localhost:4173`）。

## 七、本地调试（不走 GitHub）

本地改功能仍用：`npm run dev`（本机 `http://localhost:5174/`）。
想用手机在同网络/跨子网访问，参见之前的 cloudflared 隧道方式（HTTPS，可体验 PWA 安装）。
