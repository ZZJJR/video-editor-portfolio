#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""组装 SPA 单文件：内联 CSS + 内容数据 + 应用 JS
跨平台路径（相对脚本位置），可在本地与 GitHub Actions 中直接运行。
用法：python3 build_spa.py
输出：portfolio-spa/index.html
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
# 兼容两种位置：本地根目录（与 portfolio/ 同级）或仓库 scripts/ 子目录
ROOT = HERE if os.path.exists(os.path.join(HERE, "portfolio", "data.json")) else os.path.dirname(HERE)
SPA = os.path.join(ROOT, "portfolio-spa")
APP_JS = os.path.join(SPA, "js", "app.js")
TEMPLATE = os.path.join(SPA, "index.template.html")
OUT = os.path.join(SPA, "index.html")
DATA = os.path.join(ROOT, "portfolio", "data.json")
CSS = os.path.join(ROOT, "portfolio", "public", "css", "style.css")

with open(DATA, "r", encoding="utf-8") as f:
    content = json.load(f)
content.get("settings", {}).pop("adminPassword", None)

inject_content = (
    "window.__CONTENT__="
    + json.dumps(content, ensure_ascii=False)
    .replace("<", "\\u003c")
    .replace("\u2028", "\\u2028")
    .replace("\u2029", "\\u2029")
    + ";"
)

with open(CSS, "r", encoding="utf-8") as f:
    css = f.read()
with open(APP_JS, "r", encoding="utf-8") as f:
    app = f.read()
with open(TEMPLATE, "r", encoding="utf-8") as f:
    html = f.read()

html = html.replace("/*__CSS__*/", css)
html = html.replace("/*__CONTENT__*/", inject_content)
html = html.replace("/*__APP__*/", app)

with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)

# 自检
assert "__CONTENT__" in html and "window.__CONTENT__=" in html
assert "/*__CSS__*/" not in html and "/*__APP__*/" not in html and "/*__CONTENT__*/" not in html
assert html.count("<style>") >= 2
import re
imgs = re.findall(r"<img[^>]+>", html)
bad = [t for t in imgs if ("http://" in t or "https://" in t or "//" in t)
       and "workbuddy" not in t and "codebuddy" not in t]
print("SPA built:", OUT)
print("size:", len(html.encode("utf-8")), "bytes")
print("img tags:", len(imgs), "| third-party img links:", len(bad))
for b in bad:
    print(" -", b[:80])
print("OK" if not bad else "HAS THIRD-PARTY IMG")
