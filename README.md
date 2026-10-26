# BobTranslate

Bob translation plugins for OpenAI, Fireworks and Vercel AI.

## Packages

- `openai-bob-translate.bobplugin` - OpenAI Responses API, default model GPT-6 Luna, custom model supported.
- `fireworks-bob-translate.bobplugin` - Fireworks Responses API, default model DeepSeek V4.1 Flash, custom model supported.
- `vercel-bob-translate.bobplugin` - Vercel AI Responses API, default model Muse Spark 1.2, custom model supported in `creator/model-name` format.

Each plugin is an independent Bob service with its own API key and settings.
Requires Bob 1.8.0+ for OpenAI and Bob 1.14.0+ for Fireworks and Vercel AI.
