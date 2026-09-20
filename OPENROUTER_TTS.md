# OpenRouter TTS

The app can use OpenRouter's OpenAI-compatible TTS endpoint for English word and sentence audio. The voice buttons include US/UK and role presets for girl, boy, young adult, adult, older adult, and senior-style voices.

Set this server-side variable before starting `server.js`:

```sh
$env:OPENROUTER_API_KEY='your-openrouter-api-key'
node server.js
```

Or add it to the project `.env` file before starting the server:

```text
OPENROUTER_API_KEY=your-openrouter-api-key
```

Optional:

```sh
$env:OPENROUTER_TTS_MODEL='openai/gpt-4o-mini-tts-2025-12-15'
$env:OPENROUTER_BASE_URL='https://openrouter.ai/api/v1'
$env:OPENROUTER_SITE_URL='http://127.0.0.1'
$env:OPENROUTER_APP_NAME='Word Garden'
```

Generated OpenRouter audio is cached under `audio/openrouter-*`. Piper remains available for requests that use local TTS.
