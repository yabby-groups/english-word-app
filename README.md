# Word Garden MVP

这是一个无依赖的英语单词学习 APP 原型，可以直接用浏览器打开 `index.html`。

## 已实现

- 领域选择：日常、旅行、食物、校园、职场、儿童
- 单词卡：单词、音标、中文释义、英文例句、中文翻译
- 本地离线朗读：英文单词、中文释义、英文例句、例句中文翻译
- 循环播放：可设置每页单词朗读次数和自动切换时间
- 学习行为记录：已掌握、需要复习、收藏、跳过
- 学习日历：查看每天学习、新增和复习过的单词
- 同类随机加词：按当前领域一次随机增加 12 个新词
- 难度滑块：控制随机新增单词的难度范围
- 学习角色：儿童启蒙、日常入门、旅行实用、职场办公、考试进阶、高阶阅读
- 三条例句：每个单词展示并朗读 3 组贴近生活/学习/工作场景的例句和翻译
- 已掌握库：100% 学会的单词会从学习页隐藏，可从库里移出重新学习
- 短文朗读：粘贴英文短文后可整篇朗读，自动高亮难词，点击词语手动点亮并加入自定义学习库
- 本地个性化推荐：根据领域兴趣、复习紧迫度、词频、难度和掌握度排序

## 本地服务

短文朗读需要本地 TTS 服务，不要用 `file://` 或普通静态服务打开。

```sh
node server.js
```

然后访问：

```text
http://127.0.0.1:5174
```

## Docker

Docker 镜像包含 Word Garden、`/voicechat/` 语音聊天界面、内部语音聊天 API，以及 Linux x86_64 的 Piper 和中英文 medium 语音模型。构建时需要能访问 GitHub 与 Hugging Face。

```sh
docker build -t word-garden .
```

运行时通过环境文件提供 API Key；不要把 `.env` 复制进镜像。以下命令会保留生成的音频、文件工作区和日志：

```sh
docker run --detach --name word-garden \
  --publish 5174:5174 \
  --env-file .env \
  --env PORT=5174 \
  --env HOST=0.0.0.0 \
  --volume word-garden-audio:/app/audio \
  --volume word-garden-tmp:/app/.tmp \
  --volume word-garden-logs:/app/logs \
  --volume word-garden-files:/app/file-storage \
  word-garden
```

访问 `http://127.0.0.1:5174`，语音聊天位于 `/voicechat/`。镜像仅支持 Linux x86_64；容器默认使用内置 Piper 路径，可以用运行时环境变量覆盖模型或二进制路径。

短文音频由本地 Piper TTS 生成。配置 `PIPER_BIN` 和对应语言的模型后，接口会返回生成耗时、是否命中缓存、音频地址；未配置时会返回明确的配置错误。详见 [PIPER_TTS.md](./PIPER_TTS.md)。

整篇翻译是服务端 AI 能力。客户端只请求 `/api/translate`，模型 API Key 只放在服务端环境变量里，不暴露给用户浏览器。

OpenAI 模式可以直接配置 `.env`：

```text
PORT=5182
OPENAI_API_KEY=server-side-secret
OPENAI_MODEL=gpt-5-mini
OPENAI_BASE_URL=https://api.openai.com/v1
AI_REQUEST_TIMEOUT_MS=60000
TRANSLATE_PROVIDER=openai
```

然后启动：

```sh
node server.js
```

服务端会返回 `usage` 和 `chargedTokens`，可用于用户 AI Token 扣费。

服务端可接 LibreTranslate 兼容服务：

```sh
TRANSLATE_PROVIDER=libretranslate TRANSLATE_API_URL=http://127.0.0.1:5000/translate node server.js
```

也可以接自定义服务：

```sh
TRANSLATE_PROVIDER=custom TRANSLATE_API_URL=https://your-server.example.com/translate TRANSLATE_API_KEY=server-side-secret node server.js
```

未配置时，用户只会看到“翻译服务暂时不可用”，不会看到配置说明，也不会用词典拼接冒充整篇翻译。
- 本地存储：学习记录保存在浏览器 `localStorage`

## 后续建议

- 把 `app.js` 中的内置词库迁移到 SQLite 或后端数据库
- 增加词库导入脚本，支持 WordNet、Tatoeba、词频表和人工审核内容
- 增加账号系统，把本地学习状态同步到服务端
- 替换为 React Native 或 Flutter，打包成手机 APP
