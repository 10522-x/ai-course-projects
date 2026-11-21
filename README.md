# 玖月九（跟学AI）课程项目

这里整理了课程中实际制作、适合公开的项目源码。项目按各自目录独立运行，不需要克隆网站仓库。

| 项目 | 课程 | 目录 | 说明 |
| --- | --- | --- | --- |
| 动物模仿大赛 | [用 Google AI Studio 做了个学习动物叫的网站](https://www.bilibili.com/video/BV1xzHV6zEC5) | [animal-call-arena](animal-call-arena/) | 静态网页，包含动物音频、音高分析和评分代码 |
| 本地语音识别字幕项目 | [一键部署开源语音识别模型](https://www.bilibili.com/video/BV13pWd6uEuH) | [local-funasr-subtitle-workbench](local-funasr-subtitle-workbench/) | Windows 本地 FunASR 工具；模型需要自行下载 |
| 逗猫小程序 | [小白用 AI 做小程序（上）](https://www.bilibili.com/video/BV18x4g6JExM) / [下](https://www.bilibili.com/video/BV1vT4B6KE3W) | [cat-mini-program](cat-mini-program/) | 微信小程序源码，配置使用 `touristappid` |
| 棉花娃娃小家 | [用 Vibe Coding 做棉花娃娃小家](https://www.bilibili.com/video/BV1wyxL6UEMd) | [cotton-doll-home](cotton-doll-home/) | Three.js 互动玩偶屋，含三版角色对照 |

## 使用前

- 运行方法和来源见各项目目录的 `课程资料说明.md` 或 `README.md`。
- 动物录音的作者、来源和许可逐条列在 `animal-call-arena/assets/credits.json`。再分发时须遵守每条录音各自的许可；Lucide 图标许可见该项目目录中的 `LUCIDE-LICENSE.txt`。
- FunASR 模型权重不在仓库中，按项目说明在本机下载。不要把模型、虚拟环境、个人视频、识别任务或生成字幕提交到仓库。
- 小程序项目使用游客 AppID。需要真机预览或发布时，在本机配置自己的 AppID，不要提交私有配置文件。
- 本仓库不声明适用于所有项目和资源的统一许可证。各项目依赖及素材应分别遵守其原有许可证和来源说明。

## 课程网站

[玖月九（跟学AI）课程网站](https://jiuyue-follow-ai.pages.dev)
