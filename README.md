# BobTranslate

OpenAI 和 Fireworks 的 Bob 翻译插件集合。

## 插件

- `openai-bob-translate.bobplugin`
  - API：OpenAI Responses API
  - 默认模型：GPT-5.4 nano
  - 可选模型：GPT-5.4 nano、GPT-5.4 mini、自定义模型
- `fireworks-bob-translate.bobplugin`
  - API：Fireworks Chat Completions API
  - 默认模型：Qwen3.6 Plus
  - 可选模型：Qwen3.6 Plus、Kimi K2.6、自定义模型

两个插件是独立 Bob 服务，各自只展示自己的 API Key 和模型配置。Bob 会按插件 identifier 分别保存配置，不会互相覆盖。

## 配置项

每个插件都只包含当前供应商需要的配置：

- `API Key`
- `模型`
- `自定义模型`
- `深度思考`
- `最大输出 token 数`
- `温度`

默认禁用模型思考，只支持翻译模式。

## 支持语言

- 自动检测
- 简体中文
- 繁体中文
- English
- Japanese
- Korean
- French
- German
- Spanish
- Russian
- Arabic
- Turkish
