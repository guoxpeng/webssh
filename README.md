# WebSSH

### 这是什么？

一个网页。用它可以在浏览器里控制另一台电脑。

就像遥控器控制电视一样。你坐在电脑前，打开网页，就能操作远处的一台服务器。

---

## 第一步：下载代码

打开电脑的"命令窗口"（黑框框），输入：

```
git clone https://github.com/guoxpeng/webssh.git
```

这会把代码下载到你的电脑里。

---

## 第二步：进入文件夹

```
cd webssh
```

---

## 第三步：安装

```
npm install
```

等它跑完。（可能需要 1-2 分钟）

如果电脑没有 `npm`，先去 https://nodejs.org 下载 Node.js。

---

## 第四步：打包

```
npm run build
```

等它跑完。（把代码变成浏览器能看的网页）

---

## 第五步：启动

```
node server/index.mjs
```

看到下面这行字就代表成功了：

```
🚀 WebSSH Server ready
Local:   http://localhost:9627
```

---

## 第六步：打开浏览器

在浏览器地址栏输入：

```
http://localhost:9627
```

第一次打开会叫你设置一个密码。随便设一个，**记住它**。

---

## 第七步：添加服务器

1. 填 **名称**（比如：我的服务器）
2. 填 **IP 地址**（比如：192.168.1.100）
3. 填 **用户名**（比如：root）
4. 填 **密码**
5. 点 **连接** 按钮

连上之后，黑窗口里就能敲命令了。

---

## 怎么更新到最新版？

```
cd webssh
git pull
npm install
npm run build
node server/index.mjs
```

---

## 换个端口？

```
node server/index.mjs
```

默认是 9627 端口。如果想换成 8888：

Windows 电脑：
```
set PORT=8888 && node server/index.mjs
```

Mac/Linux 电脑：
```
PORT=8888 node server/index.mjs
```

---

## 怎么让它一直在后台跑？（不会关掉窗口就停了）

Mac/Linux 电脑可以用这个命令：

```
nohup node server/index.mjs > webssh.log 2>&1 &
```

Windows 电脑可以装个 `pm2`：

```
npm install -g pm2
pm2 start server/index.mjs --name webssh
```

---

## 问题？

去这里提问：https://github.com/guoxpeng/webssh/issues
