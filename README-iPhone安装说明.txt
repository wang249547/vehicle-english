Vehicle English（iPhone 版 PWA）安装使用说明
================================================

一、这是什么格式
- 本包是一个 PWA（渐进式网页应用），可安装到 iPhone 主屏幕，像 App 一样
  有独立图标、全屏运行、离线使用（查词功能需要联网）。
- 真正的 .ipa 安装包需要苹果开发者证书 + Mac/Xcode 签名，本包采用 PWA
  方案，无需越狱、无需 TestFlight，装完即用。

二、部署（需要 https，任选一种）
1. 公司内网服务器 / 任意虚拟主机：把本文件夹内所有文件上传到站点根目录
   （必须支持 HTTPS）。
2. GitHub Pages（免费）：新建仓库 → 上传全部文件 → Settings 开启 Pages →
   得到 https://用户名.github.io/仓库名/ 地址。
3. 阿里云 OSS / 腾讯云 COS 静态网站托管（自带 HTTPS）。

三、iPhone 安装步骤
1. 用 Safari 打开部署后的网址（必须 Safari，微信/其他浏览器内打开不行）。
2. 点底部「分享」按钮 → 选择「添加到主屏幕」→ 完成。
3. 主屏幕出现汽车图标「Vehicle English」，点击即以全屏 App 方式运行。
4. 首次打开建议联网添加几个单词，之后离线也能复习、听发音（音频已缓存）。

四、注意事项
- iPhone 上的单词数据保存在 Safari 本机，与电脑上浏览器的数据相互独立。
- iOS 16.4 及以上体验最佳（支持推送图标、完整全屏）。
- 更新版本后重新访问网址并刷新即可，主屏幕图标不用重装。

包内文件：index.html / style.css / app.js / sw.js / manifest.webmanifest / icons/
