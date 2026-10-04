# Chordle

听一个钢琴和弦，在琴键上找出它。可以单人玩，也可以开房间和朋友对战。

## 文件

- `index.html`：游戏页面（钢琴采样已内嵌）
- `rhythm.html`：节奏训练，看节奏谱跟着节拍器按出来（主页“模式”栏里有入口）
- `room-client.js`：对战模式的联机代码，大约每秒向服务器同步一次各自的进度
- `api/room.js`：Vercel 函数，用 Redis 保存每个房间里玩家的状态

## 部署到 Vercel

1. 在 Vercel 点 **Add New → Project**，导入这个 GitHub 仓库。Framework Preset 选 **Other**，其余保持默认，点 Deploy。
2. 部署好后，打开项目的 **Storage** 标签，选 **Create Database → Upstash for Redis**（免费档就够），创建后连接到这个项目。
3. 回到 **Deployments**，对最新一次部署点 **Redeploy**，让新加的环境变量生效。

没有 Redis 时单人模式照常可玩，对战区会提示“联机服务还没配置好”。

接口会读取 `KV_REST_API_URL` / `KV_REST_API_TOKEN`，或 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`，任意一组都行。

## 致谢

钢琴采样来自 [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments)（MIT 许可）。
