# Piper TTS Setup

Piper is supported as the first local TTS option. When configured, `/api/tts` tries Piper first and falls back to Windows `System.Speech` if Piper is missing or fails.

## Install Layout

Recommended local paths:

```text
C:\tmp\english-word-app\tools\piper\piper.exe
C:\tmp\english-word-app\voices\en_US-lessac-medium.onnx
C:\tmp\english-word-app\voices\en_US-lessac-medium.onnx.json
```

Download a Piper Windows release and one English voice model from the Piper project. Keep the `.onnx` and matching `.onnx.json` file together in `voices\`.

## Configuration

Add this to `.env`:

```text
LOCAL_TTS_PROVIDER=auto
PIPER_BIN=C:\tmp\english-word-app\tools\piper\piper.exe
PIPER_VOICE_EN=C:\tmp\english-word-app\voices\en_US-lessac-medium.onnx
```

Optional:

```text
PIPER_VOICE_ZH=C:\tmp\english-word-app\voices\zh_CN-your-voice.onnx
PIPER_LENGTH_SCALE=1.0
PIPER_NOISE_SCALE=
PIPER_NOISE_W=
```

If `PIPER_VOICE_ZH` is empty, Chinese text falls back to Windows TTS.

## Restart

Restart the server after editing `.env`:

```powershell
$env:PORT='5182'
node server.js
```

Then open:

```text
http://127.0.0.1:5182
```

## Test

```powershell
Invoke-WebRequest -UseBasicParsing -Method Post -Uri http://127.0.0.1:5182/api/tts -ContentType 'application/json' -Body '{"text":"Piper local voice test.","lang":"en-US"}'
```

The response should include:

```json
{
  "engine": "Piper TTS",
  "audioUrl": "/audio/piper-....wav"
}
```

If Piper is not configured or fails, the response should still succeed with Windows TTS unless Windows TTS is also unavailable.
