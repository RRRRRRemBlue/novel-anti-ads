# 人人热书 · 防跳转纯净阅读

一个油猴脚本（UserScript）：拦截小说阅读站的**点击劫持、强制跳转、弹窗广告与外站 iframe**，只留正文和翻页按钮，让你安安静静看完一章。

## 特点

- 不针对某一家网站的广告代码做适配——守住「出站」这一个关口，跳转手段怎么变都能挡
- 核心基于浏览器的 [Navigation API](https://developer.mozilla.org/docs/Web/API/Navigation_API)，在导航层直接取消一次跳转（Chrome / Edge 102+ 支持）
- 右下角悬浮盾牌：实时显示拦截次数与记录，各项防护可单独开关
- 同站链接完全放行，「下一章 / 目录」不受影响

## 安装

1. 给浏览器装上 [Tampermonkey](https://www.tampermonkey.net/) 扩展
2. 安装脚本（任选其一）：
   - 打开 `renren-anti-jump.user.js`，下载后拖入 Tampermonkey 窗口；
   - 或打开 Tampermonkey 面板 → 新建脚本 → 粘贴脚本内容 → 保存
3. 打开小说章节页，右下角出现半透明盾牌 = 生效

> 图文安装教程见 [`安装指引.html`](./安装指引.html)（含不装扩展的备用方案）。

## 换站点

脚本开头 `SITES` 数组里增删域名即可支持其他小说站（一行一个，不写 `http://` 和 `www.`）。

## 文件说明

| 文件 | 说明 |
| --- | --- |
| `renren-anti-jump.user.js` | 用户脚本本体 |
| `安装指引.html` | 图文安装教程（含备用小书签方案） |
