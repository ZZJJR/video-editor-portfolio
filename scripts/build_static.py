#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""构建静态多页版：路径改写（绝对→相对）+ 内容内联。
跨平台路径（相对脚本位置）。用法：python3 build_static.py
输出：输出到 portfolio-static/（整目录，可整体部署到任意静态托管）
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "portfolio", "public")
OUT = os.path.join(ROOT, "portfolio-static")
DATA = os.path.join(ROOT, "portfolio", "data.json")

with open(DATA, "r", encoding="utf-8") as f:
    content = json.load(f)
content.get("settings", {}).pop("adminPassword", None)

inject = (
    "<script>window.__CONTENT__="
    + json.dumps(content, ensure_ascii=False)
    .replace("<", "\\u003c")
    .replace("\u2028", "\\u2028")
    .replace("\u2029", "\\u2029")
    + "</script>"
)

# 复制整目录
import shutil
if os.path.exists(OUT):
    shutil.rmtree(OUT)
shutil.copytree(SRC, OUT)


def patch_html(path):
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()
    html = html.replace('href="/css/style.css"', 'href="css/style.css"')
    html = html.replace('src="/js/main.js"', 'src="js/main.js"')
    html = html.replace('src="/js/admin.js"', 'src="js/admin.js"')
    html = html.replace('href="/#', 'href="index.html#')
    html = html.replace('href="/case?id=', 'href="case.html?id=')
    html = html.replace('href="/"', 'href="index.html"')
    html = html.replace('<a href="/" ', '<a href="index.html" ')
    if "<!--CONTENT_INJECT-->" in html:
        html = html.replace("<!--CONTENT_INJECT-->", inject)
    else:
        html = html.replace('<script src="js/main.js"></script>', inject + '\n  <script src="js/main.js"></script>')
        html = html.replace('<script src="js/admin.js"></script>', inject + '\n  <script src="js/admin.js"></script>')
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)


patch_html(os.path.join(OUT, "index.html"))
patch_html(os.path.join(OUT, "case.html"))
patch_html(os.path.join(OUT, "admin.html"))

mp = os.path.join(OUT, "js", "main.js")
with open(mp, "r", encoding="utf-8") as f:
    js = f.read()
js = js.replace("'/case?id=' +", "'case.html?id=' +")
with open(mp, "w", encoding="utf-8") as f:
    f.write(js)

print("static built:", OUT)
