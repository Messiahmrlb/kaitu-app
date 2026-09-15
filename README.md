# 开土记录录入 App

面向土工试验人员的手机端「开土记录」采集工具。逐条录入土样（描述土样情况、目力土分类鉴别、勾选每个土所需试验项目），一键生成与示例「开土记录表」结构相同的 **A3 横向 xlsx 电子表格**（用 Excel 打开打印），导出到电脑。支持**批量添加土样**（按孔号自动编号）。每个土样另含自用校对字段 **液性指数 IL / 塑性指数 Ip**，在 App 土样总览中常显、可编辑，且仅 App 内显示与本地保存，**不写入导出表格**。

## 技术栈

- 前端：React 18 + Vite + TypeScript + MUI（移动端友好，触屏适配）
- 移动端包装：Capacitor 6（产出安卓 APK），同时保留纯 Web 运行能力以便预览
- 表格生成：`exceljs`（纯前端生成 A3 横向 xlsx 电子表格，无需安装 Office）
- 本地存储：Capacitor Preferences（Web 端为 localStorage，安卓端为 SharedPreferences，接口一致）
- 导出：Web 端浏览器下载；安卓端 Capacitor Filesystem + Share（系统分享到微信/邮件/下载目录）

## 目录结构

```
kaitu-app/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── capacitor.config.ts
├── src/
│   ├── main.tsx                 # 入口
│   ├── App.tsx                  # 主界面（列表 / 编辑 / 导出编排）
│   ├── index.css
│   ├── types.ts                 # 数据模型（SoilRecord / SoilSample / EngineeringInfo）
│   ├── constants.ts             # 两类模式的土名、夹杂物、土样情况、实验项目选项
│   ├── utils.ts                 # id / 日期 / 新建记录与土样 / 批量编号
│   ├── storage.ts               # 本地存储（Preferences）
│   ├── xlsxExport.ts            # 生成并导出 A3 横向 .xlsx（还原示例表格）
│   └── components/
│       ├── ChipMultiSelect.tsx  # 触屏多选 Chip
│       ├── ModeSelectDialog.tsx # 新建时选择 A/B 格式
│       ├── EngineeringInfoForm.tsx
│       └── SampleDialog.tsx     # 单条土样录入（含 IL/Ip）
└── README.md
```

## 两种鉴别格式（关键）

新建记录时**必须**先选择格式，决定「目力鉴别土类」列的可选项与导出文档中显示的土名：

- **A 普通目力鉴别**：中砂 / 细砂 / 粉砂 / 粉土 / 粉质黏土 / 黏土
- **B 三角坐标定名**：粉砂 / 轻粉质壤土 / 中粉质壤土 / 重粉质壤土 / 粉粘土 / 粘土

其余字段（夹杂物、土样情况、要求实验项目、IL/Ip 等）两种模式完全一致。

## 土样快速批量编号（改动1）

进入某条记录的编辑页后，土样列表上方有「批量添加土样」控件：输入数量（默认 8），点「添加 N 个」即可一次性追加 N 条空白土样，土号按**孔号**自动生成：

- 孔号非空（如 `ZK1`）→ 土号 `ZK1-1`、`ZK1-2` …（从现有最大末尾序号 +1 续编，绝不覆盖已有）
- 孔号为空 → 土号 `-1`、`-2` …

续编规则：解析每条已有土号末尾的 `-数字`，取最大值 `+1` 作为起始序号；无数字后缀或无土样时从 1 起。其余字段留空待逐条补全。

## 安装依赖

```bash
cd kaitu-app
npm install
```

> 需要 Node.js 18+。若安装缓慢可配置国内镜像：`npm config set registry https://registry.npmmirror.com`

## 本地 Web 预览（立即试用）

```bash
npm run dev
```

浏览器打开 `http://localhost:5173`。手机与电脑同一局域网时，可用电脑显示的本机 IP（如 `http://192.168.x.x:5173`）在手机浏览器直接体验。竖屏触屏操作；功能与安卓 APK 完全一致（仅导出方式不同：Web 为浏览器下载）。

构建静态站点用于部署/预览：

```bash
npm run build      # 产物在 dist/
npm run preview    # 预览构建产物
```

## 构建安卓 APK

### 前置环境（本机需具备）

1. **Node.js 18+**（已用于 `npm install`）
2. **JDK 17**（Capacitor 6 / Android Gradle 插件要求）
3. **Android SDK**（含 Android Platform 34 与 Build-Tools 34.0.0）
4. 配置环境变量 `ANDROID_HOME`（指向 SDK 根目录），并把 `platform-tools` 加入 PATH

> 示例（Windows，假设 SDK 装在 `C:\Android\Sdk`）：
> ```
> set ANDROID_HOME=C:\Android\Sdk
> set PATH=%PATH%;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\cmdline-tools\latest\bin
> ```
> 用 `sdkmanager "platforms;android-34" "build-tools;34.0.0"` 安装平台与构建工具。

### 打包步骤

```bash
npm install
npm run build            # 先产出 dist/，供 Capacitor 同步
npx cap add android      # 生成 android/ 原生工程（仅需一次）
npx cap sync             # 将 web 产物同步进安卓工程
npx cap build android    # 用 Gradle 构建（会触发 license 接受）
```

- 若本机装有 Android Studio，可直接 `npx cap open android` 打开后在 Studio 里「Build → Generate Signed Bundle / APK」生成签名 APK / AAB。
- 构建产物位置：`android/app/build/outputs/apk/release/app-release-unsigned.apk`（未签名需在 Studio 或 `apksigner` 签名后安装；调试包 `app-debug.apk` 可直接 `adb install`）。

### 本机若缺失 Android SDK / JDK

`npx cap add android` 仅复制模板（不需 SDK），可正常生成 `android/` 工程；但 `npx cap build android` 需要 JDK + Android SDK 与接受 license，缺环境会失败。此时请按上方「前置环境」补齐后重试。仓库已包含可直接打包的完整原生工程配置（capacitor.config.ts + @capacitor/android 依赖）。

## 手机使用步骤

1. 安装 APK（调试包 `adb install android/app/build/outputs/apk/debug/app-debug.apk`，或签名后的 release 包）。
2. 打开「开土记录录入」→ 点右下角「+」→ 选择鉴别格式 A 或 B。
3. 填写工程信息（工程编号 / 孔号 / 孔口标高 / 开土日期）。
4. 「添加土样」逐条录入，或使用「批量添加土样」（按孔号自动编号）快速铺一批空白土样；每条可勾选目力鉴别土类、夹杂物、土样情况、要求实验项目。**土样总览每行末尾两格常显 IL / Ip，点击即可编辑**（仅 App 内）。
5. 点「保存记录」暂存（可后续在列表点开继续编辑 / 删除）。
6. 点右上角「导出xlsx」生成 A3 横向电子表格：安卓端弹出系统分享，可发送到微信 / 邮件 / 保存到下载目录；Web 端直接浏览器下载。将 xlsx 传到电脑用 Excel 打开打印即可。

## 字段与导出说明

- 导出表格（xlsx）结构：标题 → 工程信息行 → 列标题行（含合并表头）→ 子项展开行 → 每条土样一行；页面设置为 **A3 横向**、冻结前 4 行表头。
- 「目力鉴别土类」列按所选模式显示对应土名。
- **IL / Ip 不写入导出表格**，仅在 App 土样总览常显、可编辑，并随记录本地保存。
- 土号默认按 `-1, -2, …` 自动生成且可改；使用「批量添加土样」时按孔号自动编号；土样条数无上限，可增删。

## 已知遗留 / 注意

- 示例原表约 41 列，本实现按字段清单生成连续表格（约 37 个数据列），导出为 A3 横向 xlsx，列宽已按字段适配；个别长土名（如「重粉质壤土」）如需更宽可在 Excel 中手动微调。
- 导出文件名取「工程编号_孔号_开土记录表.xlsx」，两者皆空时回退为「开土记录_开土记录表.xlsx」。
- 安卓端 `Share.share` 若设备无可用分享目标会静默跳过，但文件已写入「文档」目录，可手动取出。
