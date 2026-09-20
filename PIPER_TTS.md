# Piper TTS Setup

Piper is the service's local TTS engine. Configure a Piper executable and a voice model for every language that the server should synthesize.

## Install Layout

Download a Piper release for your operating system and one or more voice models from the Piper project. Keep every `.onnx` file with its matching `.onnx.json` file.

## Configuration

Add this to `.env`:

```text
PIPER_BIN=/absolute/path/to/piper
PIPER_VOICE_EN=/absolute/path/to/en_US-lessac-medium.onnx
```

Optional:

```text
PIPER_VOICE_ZH=/absolute/path/to/zh_CN-your-voice.onnx
PIPER_LENGTH_SCALE=1.0
PIPER_NOISE_SCALE=
PIPER_NOISE_W=
```

English requests require `PIPER_VOICE_EN`; Chinese requests require `PIPER_VOICE_ZH`. The server returns a configuration error when the required Piper model is unavailable.

## Restart

Restart the server after editing `.env`:

```sh
PORT=5182 node server.js
```

Then open:

```text
http://127.0.0.1:5182
```

## Test

```sh
curl -X POST http://127.0.0.1:5182/api/tts \
  -H 'Content-Type: application/json' \
  -d '{"text":"Piper local voice test.","lang":"en-US"}'
```

The response should include:

```json
{
  "engine": "Piper TTS",
  "audioUrl": "/audio/piper-....wav"
}
```

If Piper is not configured or fails, the response returns an error; configure a valid binary and model before retrying.
