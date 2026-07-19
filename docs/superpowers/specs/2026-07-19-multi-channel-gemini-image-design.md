# 多渠道与 Gemini 图片协议设计

## 目标

- 云端渠道和用户自定义渠道都允许按能力使用不同渠道与模型，同一画布可同时调用图片、视频、文本和音频渠道。
- 视频生成与视频编辑默认使用 `1080p`、`10s`、`9:16`，图片比例继续保持独立配置。
- 图片渠道支持 OpenAI Images 协议和 Gemini 原生 `generateContent` 协议。

## 配置结构

后台云端继续使用已有 `private.channels` 多渠道配置，并按请求中的真实模型名选择包含该模型的启用渠道。管理员可为图片、视频和文本分别选择默认模型；不同模型自然路由到不同渠道，同模型多渠道继续按权重分流。

用户自定义配置新增 `customChannels`。每个渠道包含稳定 ID、名称、协议、Base URL、API Key、已选模型及图片/视频/文本/音频模型列表。配置同时保存四个能力的默认渠道 ID；默认模型仍使用现有 `imageModel`、`videoModel`、`textModel`、`audioModel` 字段，避免模型名被渠道编码污染。

发起本地请求时按能力解析渠道：先检查该能力的默认渠道是否包含当前模型，否则使用第一个包含该模型的自定义渠道。这样默认生图可走渠道 1，默认视频可走渠道 2；画布节点改选其他模型后也能自动切换到提供该模型的渠道。同名模型存在于多个渠道时使用该能力默认渠道。

## 界面

自定义渠道区使用渠道选择器管理多个渠道，并提供新增、删除、名称、协议、URL、Key、模型拉取和模型分类。能力默认值使用“渠道名 / 模型名”组合选择，明确显示实际绑定。拉取模型只刷新候选项，仍由用户手动选择。

云端后台渠道协议新增 `Gemini 原生图片`，继续沿用现有多渠道列表、模型选择和能力默认模型界面。

## Gemini 数据流

本地 Gemini 渠道由浏览器直接请求：

```text
POST {BASE}/v1beta/models/{model}:generateContent
x-goog-api-key: {key}
```

文生图将提示词放入 `contents[].parts[].text`；图生图将参考图转换为 `inlineData`。图片尺寸映射为 `generationConfig.imageConfig.imageSize` 和 `aspectRatio`。响应同时读取 `inlineData.data` 和 `fileData.fileUri`。

云端 Gemini 渠道仍由 Canvas 后端保管密钥。前端继续提交 OpenAI Images 形态，Go 代理在选中 `gemini` 渠道后转换为 Gemini 请求；返回保持 Gemini 原始 JSON，由统一前端解析器读取。管理员拉取模型时请求 Gemini `/v1beta/models`，并去掉返回名称中的 `models/` 前缀。

Gemini 原生协议只用于图片生成与参考图编辑；文本和音频仍应配置 OpenAI 兼容渠道。蒙版编辑不在本次 Gemini 支持范围内，使用时返回明确错误。

## 默认值与验证

新增独立 `videoSize`，避免把图片默认比例一并改为竖屏。默认值为：

- `videoSize: "9:16"`
- `videoSeconds: "10"`
- `vquality: "1080p"`

测试覆盖配置归一化、能力渠道解析、视频默认值、Gemini URL/请求体/响应解析以及后台 Gemini 模型列表解析。前端执行 Bun 测试；当前环境无 Go 工具链时保留 Go 测试并明确说明未执行。按项目规则不执行构建。
