# -*- coding: utf-8 -*-
"""生成 install.html —— 手机专用「一键复制最新脚本代码」页面。

用法：改动 renren-anti-jump.user.js 后，运行本脚本即可重新生成 install.html。
    python tools/build_install_page.py
"""
import os

base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
js_path = os.path.join(base, "renren-anti-jump.user.js")
out_path = os.path.join(base, "install.html")

js = open(js_path, encoding="utf8", newline="").read()
if "</script>" in js or "<script" in js:
    raise SystemExit("ABORT: userscript contains script tag literal, cannot embed")

TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>防跳转脚本 · 一键复制</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;padding:22px 16px 40px;background:#101216;color:#e8eaee;font:16px/1.75 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
.card{max-width:560px;margin:0 auto;background:#1c1e23;border:1px solid #2c3037;border-radius:18px;padding:22px 18px}
h1{font-size:19px;margin:0 0 6px}
.ver{color:#7ee2b8;font-size:14px;font-weight:normal}
p.lead{color:#9aa1ad;font-size:14px;margin:0 0 18px}
button{display:block;width:100%;padding:17px 16px;font-size:17px;font-weight:600;border-radius:14px;border:0;cursor:pointer}
#copy{background:#0f7b5f;color:#fff;margin-bottom:10px}
#copy:active{background:#0c654e}
#copy.done{background:#274b3d}
a.alt{display:block;text-align:center;color:#7ee2b8;font-size:13.5px;text-decoration:none;padding:10px 0 2px}
ol{color:#9aa1ad;font-size:14px;line-height:2;padding-left:22px;margin:16px 0 0;border-top:1px solid #2a2d33;padding-top:14px}
b{color:#e8eaee}
.tip{color:#6f757f;font-size:12px;margin-top:12px}
</style>
</head>
<body>
<div class="card">
  <h1>&#128737; 防跳转脚本 <span class="ver">最新版</span></h1>
  <p class="lead">点下面的按钮复制完整代码，然后到油猴（Tampermonkey）里粘贴保存。</p>
  <button id="copy" data-label="&#128203; 一键复制脚本代码">&#128203; 一键复制脚本代码</button>
  <a class="alt" href="https://github.com/RRRRRRemBlue/novel-anti-ads/raw/main/renren-anti-jump.user.js">或者：点这里尝试直接安装（需油猴支持）</a>
  <ol>
    <li>点上方按钮（显示"已复制"即可）</li>
    <li>打开油猴 &rarr; 找到「人人热书 · 防跳转纯净阅读」&rarr; 点「编辑」</li>
    <li>编辑器里先 <b>全选 &rarr; 删除</b> 旧内容</li>
    <li>粘贴新代码 &rarr; 保存 &rarr; 弹权限确认时点「允许」</li>
  </ol>
  <div class="tip">保存后打开人人热书：顶部出现绿色小横幅 = 脚本加载成功。</div>
</div>
<script id="src-userscript" type="text/plain">__USERSCRIPT_SOURCE__</script>
<script>
(function () {
  var btn = document.getElementById('copy');
  function setDone() {
    btn.textContent = '\\u2705 已复制！去油猴粘贴吧';
    btn.classList.add('done');
    setTimeout(function () {
      btn.textContent = btn.getAttribute('data-label');
      btn.classList.remove('done');
    }, 3000);
  }
  function fallback(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try { document.execCommand('copy'); } catch (e) { }
    ta.remove();
  }
  btn.addEventListener('click', function () {
    var text = document.getElementById('src-userscript').textContent.trim();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(setDone, function () { fallback(text); setDone(); });
    } else {
      fallback(text); setDone();
    }
  });
})();
</script>
</body>
</html>
"""

html = TEMPLATE.replace("__USERSCRIPT_SOURCE__", js)
open(out_path, "w", encoding="utf8", newline="").write(html)
print("install.html written:", len(html), "chars")
