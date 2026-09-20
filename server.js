const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const root = __dirname;
loadEnvFile(path.join(root, ".env"));
const audioDir = path.join(root, "audio");
const tmpDir = path.join(root, ".tmp");
const logsDir = path.join(root, "logs");
const voiceChatDir = path.join(root, "voicechat");
const voiceChatDistDir = path.join(voiceChatDir, "dist");
const voiceChatPort = 8787;
let voiceChatProcess = null;
const fileStorageDir = path.join(root, "file-storage");
const localFilesDir = path.join(fileStorageDir, "local");
const cloudFilesDir = path.join(fileStorageDir, "cloud");
const sharesFile = path.join(fileStorageDir, "shares.json");
const projectMirrorDir = path.join(localFilesDir, "EnglishWordProject");
const projectMirrorEnabled = process.env.PROJECT_WORKSPACE_SYNC !== "false";
const projectMirrorExcludedNames = new Set([
  ".agents",
  ".codex",
  ".git",
  ".tmp",
  ".env",
  "audio",
  "file-storage",
  "logs",
  "node_modules"
]);
const port = Number(process.env.PORT || 5174);
const translateProvider = process.env.TRANSLATE_PROVIDER || "openai";
const translateApiUrl = process.env.TRANSLATE_API_URL || "";
const translateApiKey = process.env.TRANSLATE_API_KEY || "";
const openaiApiKey = process.env.OPENAI_API_KEY || process.env.HUABOT_OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY || "";
const openaiBaseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const openaiModel = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const openaiTranscribeModel = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";
const openaiTtsModel = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const openaiTtsFormat = process.env.OPENAI_TTS_FORMAT || "mp3";
const huabotTtsApiKey = process.env.HUABOT_TTS_API_KEY || process.env.SANDBOX_AI_KEY || process.env.HUABOT_OPENAI_API_KEY || openaiApiKey;
const huabotTtsBaseUrl = (process.env.HUABOT_TTS_BASE_URL || "https://iot.huabot.com/v1").replace(/\/+$/, "");
const huabotTtsModel = process.env.HUABOT_TTS_MODEL || "gpt-4o-mini-tts";
const openrouterApiKey = process.env.OPENROUTER_API_KEY || "";
const openrouterBaseUrl = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
const openrouterTtsModel = process.env.OPENROUTER_TTS_MODEL || "openai/gpt-4o-mini-tts-2025-12-15";
const openrouterSiteUrl = process.env.OPENROUTER_SITE_URL || "http://127.0.0.1";
const openrouterAppName = process.env.OPENROUTER_APP_NAME || "Word Garden";
const aiRequestTimeoutMs = Number(process.env.AI_REQUEST_TIMEOUT_MS || 60000);
const openaiTemperature = process.env.OPENAI_TEMPERATURE === "" ? null : Number(process.env.OPENAI_TEMPERATURE || "0.4");
const supportsTemperature = !/^gpt-5/i.test(openaiModel);
const azureSpeechKey = process.env.AZURE_SPEECH_KEY || process.env.SPEECH_KEY || "";
const azureSpeechRegion = process.env.AZURE_SPEECH_REGION || process.env.SPEECH_REGION || "";
const azureSpeechEndpoint = (process.env.AZURE_SPEECH_ENDPOINT || "").replace(/\/+$/, "");
const azureTtsOutputFormat = process.env.AZURE_TTS_OUTPUT_FORMAT || "riff-24khz-16bit-mono-pcm";
const azureTtsExtension = azureTtsOutputFormat.startsWith("riff-") ? "wav" : "mp3";
const localTtsProvider = (process.env.LOCAL_TTS_PROVIDER || "auto").toLowerCase();
const piperBin = process.env.PIPER_BIN || "";
const piperVoiceEn = process.env.PIPER_VOICE_EN || process.env.PIPER_VOICE || "";
const piperVoiceZh = process.env.PIPER_VOICE_ZH || "";
const piperConfigEn = process.env.PIPER_CONFIG_EN || process.env.PIPER_CONFIG || "";
const piperConfigZh = process.env.PIPER_CONFIG_ZH || "";
const piperLengthScale = process.env.PIPER_LENGTH_SCALE || "";
const piperNoiseScale = process.env.PIPER_NOISE_SCALE || "";
const piperNoiseW = process.env.PIPER_NOISE_W || "";
const ossRequestTimeoutMs = Number(process.env.OSS_REQUEST_TIMEOUT_MS || 15000);
const serverOssConfig = parseOssConfig({
  provider: process.env.OSS_PROVIDER || process.env.ALIYUN_OSS_PROVIDER || "aliyun",
  region: process.env.OSS_REGION || process.env.ALIYUN_OSS_REGION || "",
  bucket: process.env.OSS_BUCKET || process.env.ALIYUN_OSS_BUCKET || "",
  endpoint: process.env.OSS_ENDPOINT || process.env.ALIYUN_OSS_ENDPOINT || "",
  accessKeyId: process.env.OSS_ACCESS_KEY_ID || process.env.ALIYUN_OSS_ACCESS_KEY_ID || "",
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || process.env.ALIYUN_OSS_ACCESS_KEY_SECRET || "",
  securityToken: process.env.OSS_SECURITY_TOKEN || process.env.ALIYUN_OSS_SECURITY_TOKEN || "",
  prefix: process.env.OSS_PREFIX || process.env.ALIYUN_OSS_PREFIX || "",
  publicBaseUrl: process.env.OSS_PUBLIC_BASE_URL || process.env.ALIYUN_OSS_PUBLIC_BASE_URL || ""
}, "server-env");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

fs.mkdirSync(audioDir, { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });
fs.mkdirSync(logsDir, { recursive: true });
fs.mkdirSync(localFilesDir, { recursive: true });
fs.mkdirSync(cloudFilesDir, { recursive: true });

function shouldMirrorProjectEntry(name) {
  return !projectMirrorExcludedNames.has(name) && name !== "english-word-app.rar";
}

function syncProjectDirectory(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  const sourceNames = new Set(fs.readdirSync(sourceDir).filter(shouldMirrorProjectEntry));

  for (const targetName of fs.readdirSync(targetDir)) {
    if (!sourceNames.has(targetName)) {
      fs.rmSync(path.join(targetDir, targetName), { recursive: true, force: true });
    }
  }

  for (const name of sourceNames) {
    const sourcePath = path.join(sourceDir, name);
    const targetPath = path.join(targetDir, name);
    const sourceStat = fs.statSync(sourcePath);
    if (sourceStat.isDirectory()) {
      if (fs.existsSync(targetPath) && !fs.statSync(targetPath).isDirectory()) {
        fs.rmSync(targetPath, { force: true });
      }
      syncProjectDirectory(sourcePath, targetPath);
      continue;
    }

    const targetStat = fs.existsSync(targetPath) ? fs.statSync(targetPath) : null;
    if (!targetStat || targetStat.isDirectory() || targetStat.size !== sourceStat.size || targetStat.mtimeMs < sourceStat.mtimeMs) {
      if (targetStat?.isDirectory()) fs.rmSync(targetPath, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(sourcePath, targetPath);
      fs.utimesSync(targetPath, sourceStat.atime, sourceStat.mtime);
    }
  }
}

function startProjectWorkspaceSync() {
  if (!projectMirrorEnabled) return;
  let timer = null;
  const sync = () => {
    try {
      syncProjectDirectory(root, projectMirrorDir);
    } catch (error) {
      console.error(`Project workspace sync failed: ${error.message}`);
    }
  };

  sync();
  fs.watch(root, { recursive: true }, (_eventType, fileName) => {
    const relativeName = String(fileName || "").replace(/\\/g, "/");
    const topLevelName = relativeName.split("/")[0];
    if (!relativeName || !shouldMirrorProjectEntry(topLevelName)) return;
    clearTimeout(timer);
    timer = setTimeout(sync, 250);
  });
  console.log(`Project workspace sync: ${projectMirrorDir}`);
}

startProjectWorkspaceSync();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".opus": "audio/ogg",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".pcm": "application/octet-stream",
  ".zip": "application/zip",
  ".md": "text/markdown; charset=utf-8"
  ,".svg": "image/svg+xml"
  ,".wasm": "application/wasm"
  ,".onnx": "application/octet-stream"
  ,".woff2": "font/woff2"
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 200000) {
        reject(new Error("Text is too long."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function readBuffer(req, limitBytes = 200 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    req.on("data", (chunk) => {
      length += chunk.length;
      if (length > limitBytes) {
        reject(new Error("Upload is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function fileBase(space) {
  if (space === "cloud") return cloudFilesDir;
  return localFilesDir;
}

function cleanRelativePath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

function safeFileName(value) {
  const base = path.basename(String(value || "").trim()).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
  return base || `file-${Date.now()}`;
}

function resolveWorkspacePath(space, relativePath = "") {
  const base = fileBase(space);
  const resolved = path.resolve(base, cleanRelativePath(relativePath));
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    throw new Error("Invalid file path.");
  }
  return resolved;
}

function workspaceRelative(base, absolutePath) {
  return path.relative(base, absolutePath).replace(/\\/g, "/");
}

function parseMultipartFiles(contentType, buffer) {
  const match = String(contentType || "").match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) throw new Error("Missing multipart boundary.");
  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const separator = Buffer.from("\r\n\r\n");
  const files = [];
  let cursor = buffer.indexOf(boundary);

  while (cursor !== -1) {
    let partStart = cursor + boundary.length;
    if (buffer.slice(partStart, partStart + 2).toString() === "--") break;
    if (buffer.slice(partStart, partStart + 2).toString() === "\r\n") partStart += 2;

    const headerEnd = buffer.indexOf(separator, partStart);
    if (headerEnd === -1) break;
    const contentStart = headerEnd + separator.length;
    const nextBoundary = buffer.indexOf(boundary, contentStart);
    if (nextBoundary === -1) break;

    const headers = buffer.slice(partStart, headerEnd).toString("utf8");
    const disposition = headers.match(/content-disposition:[^\n]+/i)?.[0] || "";
    const filenameMatch = disposition.match(/filename="([^"]*)"/i);
    if (filenameMatch && filenameMatch[1]) {
      let contentEnd = nextBoundary;
      if (buffer.slice(contentEnd - 2, contentEnd).toString() === "\r\n") contentEnd -= 2;
      files.push({
        name: safeFileName(filenameMatch[1]),
        data: buffer.slice(contentStart, contentEnd)
      });
    }
    cursor = nextBoundary;
  }
  return files;
}

function contentTypeForName(name) {
  return mimeTypes[path.extname(name).toLowerCase()] || "application/octet-stream";
}

function parseOssConfig(config, source = "request-header") {
  return {
    provider: config.provider || "aliyun",
    region: String(config.region || "").trim(),
    bucket: String(config.bucket || "").trim(),
    endpoint: normalizeOssEndpoint(config.endpoint),
    accessKeyId: String(config.accessKeyId || "").trim(),
    accessKeySecret: String(config.accessKeySecret || ""),
    securityToken: String(config.securityToken || "").trim(),
    prefix: normalizeOssPrefix(config.prefix),
    publicBaseUrl: String(config.publicBaseUrl || "").trim().replace(/\/+$/, ""),
    source
  };
}

function normalizeOssEndpoint(value) {
  const cleaned = String(value || "").trim().replace(/\/+$/, "");
  if (!cleaned) return "";
  return /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
}

function decodeOssConfig(req) {
  const header = req.headers["x-oss-config"];
  if (!header) return null;
  try {
    const config = JSON.parse(Buffer.from(String(header), "base64").toString("utf8"));
    return parseOssConfig(config);
  } catch {
    return null;
  }
}

function normalizeOssPrefix(value) {
  const cleaned = String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .trim();
  return cleaned && !cleaned.endsWith("/") ? `${cleaned}/` : cleaned;
}

function isOssConfigured(config) {
  return Boolean(config?.bucket && config?.endpoint && config?.accessKeyId && config?.accessKeySecret);
}

function shouldUseOss(space, req) {
  const config = decodeOssConfig(req) || serverOssConfig;
  return space === "cloud" && isOssConfigured(config) ? config : null;
}

function safeOssInfo(config) {
  if (!config) return null;
  return {
    configured: isOssConfigured(config),
    source: config.source || "request-header",
    bucket: config.bucket || "",
    endpoint: config.endpoint || "",
    prefix: config.prefix || "",
    hasAccessKeyId: Boolean(config.accessKeyId),
    hasAccessKeySecret: Boolean(config.accessKeySecret),
    hasSecurityToken: Boolean(config.securityToken)
  };
}

function ossKey(config, relativePath = "") {
  const raw = String(relativePath || "").replace(/\\/g, "/");
  const cleaned = cleanRelativePath(raw);
  return `${config.prefix}${cleaned}${cleaned && raw.endsWith("/") ? "/" : ""}`;
}

function ossDirPrefix(config, dir = "") {
  const cleaned = cleanRelativePath(dir);
  return `${config.prefix}${cleaned ? `${cleaned}/` : ""}`;
}

function encodeOssPath(value) {
  return String(value || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function canonicalizeOssHeaders(headers) {
  return Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), String(value).trim()])
    .filter(([key]) => key.startsWith("x-oss-"))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}\n`)
    .join("");
}

function canonicalizeOssResource(config, objectKey, query = {}) {
  const resourcePath = `/${config.bucket}${objectKey ? `/${objectKey}` : "/"}`;
  const params = Object.entries(query)
    .filter(([key, value]) => isCanonicalOssQueryParam(key) && value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}${value === "" ? "" : `=${value}`}`);
  return params.length ? `${resourcePath}?${params.join("&")}` : resourcePath;
}

function isCanonicalOssQueryParam(key) {
  return canonicalOssQueryParams.has(String(key)) || String(key).toLowerCase().startsWith("response-");
}

const canonicalOssQueryParams = new Set([
  "acl",
  "append",
  "asyncFetch",
  "bucketInfo",
  "callback",
  "callback-var",
  "cname",
  "comp",
  "cors",
  "delete",
  "encryption",
  "inventory",
  "lifecycle",
  "live",
  "location",
  "logging",
  "metaQuery",
  "objectInfo",
  "objectMeta",
  "partData",
  "partInfo",
  "partNumber",
  "policy",
  "position",
  "qos",
  "referer",
  "replication",
  "requestPayment",
  "restore",
  "security-token",
  "stat",
  "style",
  "styleName",
  "tagging",
  "torrent",
  "uploadId",
  "uploads",
  "versionId",
  "versioning",
  "versions",
  "vod",
  "website",
  "worm",
  "x-oss-ac-forward-allow",
  "x-oss-ac-source-ip",
  "x-oss-ac-subnet-mask",
  "x-oss-async-process",
  "x-oss-process",
  "x-oss-request-payer",
  "x-oss-traffic-limit"
]);

function signOss(config, method, objectKey, headers, query = {}) {
  const contentMd5 = headers["Content-MD5"] || "";
  const contentType = headers["Content-Type"] || "";
  const date = headers.Date || "";
  const canonicalHeaders = canonicalizeOssHeaders(headers);
  const canonicalResource = canonicalizeOssResource(config, objectKey, query);
  const stringToSign = [method, contentMd5, contentType, date].join("\n") + `\n${canonicalHeaders}${canonicalResource}`;
  return crypto.createHmac("sha1", config.accessKeySecret).update(stringToSign).digest("base64");
}

function ossUrl(config, objectKey = "", query = {}) {
  let endpoint;
  try {
    endpoint = new URL(config.endpoint);
  } catch {
    throw new Error("OSS Endpoint 格式不正确，请填写类似 https://oss-cn-hangzhou.aliyuncs.com 的地址。");
  }
  const host = endpoint.hostname.startsWith(`${config.bucket}.`)
    ? endpoint.hostname
    : `${config.bucket}.${endpoint.hostname}`;
  const url = new URL(`${endpoint.protocol}//${host}${endpoint.port ? `:${endpoint.port}` : ""}/`);
  url.pathname = objectKey ? `/${encodeOssPath(objectKey)}` : "/";
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url;
}

function ossRequest(config, method, objectKey = "", options = {}) {
  const body = options.body || null;
  const query = options.query || {};
  const headers = {
    Date: new Date().toUTCString(),
    ...options.headers
  };
  if (config.securityToken) headers["x-oss-security-token"] = config.securityToken;
  if (body && !headers["Content-Length"]) headers["Content-Length"] = Buffer.byteLength(body);
  headers.Authorization = `OSS ${config.accessKeyId}:${signOss(config, method, objectKey, headers, query)}`;
  const url = ossUrl(config, objectKey, query);

  return new Promise((resolve, reject) => {
    const request = https.request(url, { method, headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const data = Buffer.concat(chunks);
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve({ data, headers: response.headers, statusCode: response.statusCode });
          return;
        }
        reject(new Error(`OSS request failed (${response.statusCode}): ${data.toString("utf8") || response.statusMessage}`));
      });
    });
    request.setTimeout(ossRequestTimeoutMs, () => {
      request.destroy(new Error(`OSS request timed out after ${ossRequestTimeoutMs}ms. Check endpoint, bucket region, network, and access policy.`));
    });
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

function xmlText(xml, tag) {
  const match = String(xml).match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function decodeXml(value) {
  return String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

async function listOssWorkspace(config, dir) {
  const prefix = ossDirPrefix(config, dir);
  const response = await ossRequest(config, "GET", "", {
    query: { prefix, delimiter: "/", "max-keys": "1000" }
  });
  const xml = response.data.toString("utf8");
  const files = [];
  for (const match of xml.matchAll(/<CommonPrefixes>[\s\S]*?<Prefix>([\s\S]*?)<\/Prefix>[\s\S]*?<\/CommonPrefixes>/gi)) {
    const fullPrefix = decodeXml(match[1]);
    const relative = fullPrefix.slice(config.prefix.length).replace(/\/$/, "");
    const name = path.posix.basename(relative);
    if (name) {
      files.push({ name, type: "folder", path: relative, size: 0, modifiedAt: new Date().toISOString() });
    }
  }
  for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/gi)) {
    const item = match[1];
    const key = xmlText(item, "Key");
    if (!key || key === prefix || key.endsWith("/")) continue;
    const relative = key.slice(config.prefix.length);
    const name = path.posix.basename(relative);
    if (!name) continue;
    files.push({
      name,
      type: "file",
      path: relative,
      size: Number(xmlText(item, "Size") || 0),
      modifiedAt: xmlText(item, "LastModified") || new Date().toISOString()
    });
  }
  return files;
}

async function putOssObject(config, relativePath, data, contentType = "application/octet-stream") {
  await ossRequest(config, "PUT", ossKey(config, relativePath), {
    body: data,
    headers: { "Content-Type": contentType }
  });
}

async function getOssObject(config, relativePath) {
  return ossRequest(config, "GET", ossKey(config, relativePath));
}

async function deleteOssObject(config, relativePath) {
  await ossRequest(config, "DELETE", ossKey(config, relativePath));
}

async function listOssKeys(config, prefix) {
  const keys = [];
  let marker = "";
  do {
    const query = { prefix, "max-keys": "1000" };
    if (marker) query.marker = marker;
    const response = await ossRequest(config, "GET", "", { query });
    const xml = response.data.toString("utf8");
    for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/gi)) {
      const key = xmlText(match[1], "Key");
      if (key) keys.push(key);
    }
    marker = xmlText(xml, "NextMarker");
    if (!/true/i.test(xmlText(xml, "IsTruncated"))) break;
  } while (marker);
  return keys;
}

async function deleteOssPath(config, relativePath) {
  const key = ossKey(config, relativePath);
  if (key.endsWith("/")) {
    for (const itemKey of await listOssKeys(config, key)) {
      await ossRequest(config, "DELETE", itemKey);
    }
    return;
  }
  const children = await listOssKeys(config, `${key}/`);
  if (children.length) {
    for (const itemKey of children) await ossRequest(config, "DELETE", itemKey);
    return;
  }
  await deleteOssObject(config, relativePath);
}

async function copyOssObject(config, sourceRelativePath, targetRelativePath) {
  const sourceKey = ossKey(config, sourceRelativePath);
  await ossRequest(config, "PUT", ossKey(config, targetRelativePath), {
    headers: {
      "Content-Type": "application/octet-stream",
      "x-oss-copy-source": `/${config.bucket}/${encodeOssPath(sourceKey)}`
    }
  });
}

function signOssDownloadUrl(config, relativePath, expiresInSeconds = 3600) {
  const objectKey = ossKey(config, relativePath);
  const expires = String(Math.floor(Date.now() / 1000) + expiresInSeconds);
  const query = {
    OSSAccessKeyId: config.accessKeyId,
    Expires: expires
  };
  if (config.securityToken) query["security-token"] = config.securityToken;
  const signature = signOss(config, "GET", objectKey, { Date: expires }, query);
  query.Signature = signature;
  return ossUrl(config, objectKey, query).href;
}

function listWorkspace(space, dir) {
  const base = fileBase(space);
  const target = resolveWorkspacePath(space, dir);
  fs.mkdirSync(target, { recursive: true });
  return fs.readdirSync(target, { withFileTypes: true })
    .map((entry) => {
      const absolutePath = path.join(target, entry.name);
      const stat = fs.statSync(absolutePath);
      const type = entry.isDirectory() ? "folder" : "file";
      return {
        name: entry.name,
        type,
        path: workspaceRelative(base, absolutePath),
        size: type === "file" ? stat.size : 0,
        modifiedAt: stat.mtime.toISOString()
      };
    });
}

function copyRecursive(source, target) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyRecursive(path.join(source, entry), path.join(target, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function zipDirectory(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    if (fs.existsSync(outputPath)) fs.rmSync(outputPath, { force: true });
    const scriptPath = path.join(tmpDir, `zip-workspace-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.ps1`);
    const script = [
      "param([string]$source, [string]$dest)",
      "$ErrorActionPreference = 'Stop'",
      "if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Force }",
      "Add-Type -AssemblyName System.IO.Compression.FileSystem",
      "[System.IO.Compression.ZipFile]::CreateFromDirectory($source, $dest, [System.IO.Compression.CompressionLevel]::Optimal, $false, [System.Text.Encoding]::UTF8)"
    ].join("\r\n");
    fs.writeFileSync(scriptPath, script, "utf8");
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      sourceDir,
      outputPath
    ], { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      try {
        if (fs.existsSync(scriptPath)) fs.rmSync(scriptPath, { force: true });
      } catch {}
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve(outputPath);
        return;
      }
      reject(new Error(stderr.trim() || `Zip process failed with exit code ${code}.`));
    });
  });
}

function sendFileDownload(res, filePath, downloadName, contentType, cleanupDir = "") {
  const cleanup = () => {
    if (!cleanupDir) return;
    try {
      fs.rmSync(cleanupDir, { recursive: true, force: true });
    } catch {}
  };
  const stream = fs.createReadStream(filePath);
  stream.on("error", (error) => {
    cleanup();
    if (!res.headersSent) sendJson(res, 500, { error: error.message });
    else res.destroy(error);
  });
  res.on("close", cleanup);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": fs.statSync(filePath).size,
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`
  });
  stream.pipe(res);
}

async function createOssFolderZip(config, relativePath) {
  const folderKey = `${ossKey(config, relativePath).replace(/\/+$/, "")}/`;
  const objectKeys = await listOssKeys(config, folderKey);
  const tempRoot = fs.mkdtempSync(path.join(tmpDir, "folder-download-"));
  const stagedDir = path.join(tempRoot, safeFileName(path.posix.basename(relativePath) || "folder"));
  fs.mkdirSync(stagedDir, { recursive: true });
  try {
    for (const objectKey of objectKeys) {
      if (objectKey.endsWith("/")) continue;
      const childPath = cleanRelativePath(objectKey.slice(folderKey.length));
      if (!childPath) continue;
      const target = path.join(stagedDir, ...childPath.split("/"));
      const object = await ossRequest(config, "GET", objectKey);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, object.data);
    }
    const zipPath = path.join(tempRoot, `${safeFileName(path.posix.basename(relativePath) || "folder")}.zip`);
    await zipDirectory(stagedDir, zipPath);
    return { tempRoot, zipPath };
  } catch (error) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

function loadShares() {
  if (!fs.existsSync(sharesFile)) return {};
  try {
    return JSON.parse(fs.readFileSync(sharesFile, "utf8"));
  } catch {
    return {};
  }
}

function saveShares(shares) {
  fs.mkdirSync(path.dirname(sharesFile), { recursive: true });
  fs.writeFileSync(sharesFile, JSON.stringify(shares, null, 2), "utf8");
}

function sendJson(res, status, body) {
  send(res, status, JSON.stringify(body), { "Content-Type": "application/json" });
}

async function handleFileList(req, res) {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    const space = url.searchParams.get("space") === "cloud" ? "cloud" : "local";
    const dir = url.searchParams.get("dir") || "";
    const ossConfig = shouldUseOss(space, req);
    if (ossConfig) {
      sendJson(res, 200, {
        space,
        dir: cleanRelativePath(dir),
        prefix: ossDirPrefix(ossConfig, dir) || "",
        bucket: ossConfig.bucket,
        ossSource: ossConfig.source || "request-header",
        files: await listOssWorkspace(ossConfig, dir),
        storage: "oss"
      });
      return;
    }
    sendJson(res, 200, {
      space,
      dir: cleanRelativePath(dir),
      files: listWorkspace(space, dir),
      storage: space === "cloud" ? "server-cloud" : "local"
    });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

async function handleOssHealth(req, res) {
  const requestConfig = decodeOssConfig(req);
  const config = requestConfig || serverOssConfig;
  const info = safeOssInfo(config);
  if (!isOssConfigured(config)) {
    sendJson(res, 200, {
      ok: false,
      storage: "server-cloud",
      message: "OSS is not configured for this request or server environment.",
      config: info
    });
    return;
  }
  try {
    const files = await listOssWorkspace(config, "");
    sendJson(res, 200, {
      ok: true,
      storage: "oss",
      config: info,
      fileCount: files.length,
      sample: files.slice(0, 8).map((item) => ({ name: item.name, type: item.type, path: item.path }))
    });
  } catch (error) {
    sendJson(res, 400, {
      ok: false,
      storage: "oss",
      config: info,
      error: error.message
    });
  }
}

async function handleFileUpload(req, res) {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    const space = url.searchParams.get("space") === "cloud" ? "cloud" : "local";
    const dir = url.searchParams.get("dir") || "";
    const ossConfig = shouldUseOss(space, req);
    if (ossConfig) {
      const files = parseMultipartFiles(req.headers["content-type"], await readBuffer(req));
      for (const file of files) {
        const relativePath = cleanRelativePath(path.posix.join(cleanRelativePath(dir), file.name));
        await putOssObject(ossConfig, relativePath, file.data, contentTypeForName(file.name));
      }
      sendJson(res, 200, { uploaded: files.map((file) => file.name), storage: "oss" });
      return;
    }
    const targetDir = resolveWorkspacePath(space, dir);
    fs.mkdirSync(targetDir, { recursive: true });
    const files = parseMultipartFiles(req.headers["content-type"], await readBuffer(req));
    for (const file of files) {
      fs.writeFileSync(path.join(targetDir, file.name), file.data);
    }
    sendJson(res, 200, { uploaded: files.map((file) => file.name) });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

async function handleFileFolder(req, res) {
  try {
    const payload = JSON.parse(await readBody(req));
    const space = payload.space === "cloud" ? "cloud" : "local";
    const ossConfig = shouldUseOss(space, req);
    if (ossConfig) {
      const relativePath = cleanRelativePath(path.posix.join(cleanRelativePath(payload.dir), safeFileName(payload.name)));
      await putOssObject(ossConfig, `${relativePath}/`, Buffer.alloc(0));
      sendJson(res, 200, { ok: true, storage: "oss" });
      return;
    }
    const targetDir = resolveWorkspacePath(space, path.join(cleanRelativePath(payload.dir), safeFileName(payload.name)));
    fs.mkdirSync(targetDir, { recursive: true });
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

async function handleFileDownload(req, res) {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    const space = url.searchParams.get("space") === "cloud" ? "cloud" : "local";
    const relativePath = cleanRelativePath(url.searchParams.get("path") || "");
    const downloadFolder = url.searchParams.get("type") === "folder";
    const ossConfig = shouldUseOss(space, req);
    if (ossConfig) {
      if (downloadFolder) {
        const archive = await createOssFolderZip(ossConfig, relativePath);
        const downloadName = `${safeFileName(path.posix.basename(relativePath) || "folder")}.zip`;
        sendFileDownload(res, archive.zipPath, downloadName, "application/zip", archive.tempRoot);
        return;
      }
      const object = await getOssObject(ossConfig, relativePath);
      res.writeHead(200, {
        "Content-Type": object.headers["content-type"] || contentTypeForName(relativePath),
        "Content-Disposition": `attachment; filename="${encodeURIComponent(path.posix.basename(relativePath))}"`
      });
      res.end(object.data);
      return;
    }
    const target = resolveWorkspacePath(space, relativePath);
    if (!fs.existsSync(target)) {
      sendJson(res, 404, { error: "File not found." });
      return;
    }
    if (fs.statSync(target).isDirectory()) {
      if (!downloadFolder) {
        sendJson(res, 400, { error: "Folder downloads must request ZIP format." });
        return;
      }
      const tempRoot = fs.mkdtempSync(path.join(tmpDir, "folder-download-"));
      const downloadName = `${safeFileName(path.basename(target) || "folder")}.zip`;
      const zipPath = path.join(tempRoot, downloadName);
      await zipDirectory(target, zipPath);
      sendFileDownload(res, zipPath, downloadName, "application/zip", tempRoot);
      return;
    }
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(target)] || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(path.basename(target))}"`
    });
    fs.createReadStream(target).pipe(res);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

async function handleFileDelete(req, res) {
  try {
    const payload = JSON.parse(await readBody(req));
    const space = payload.space === "cloud" ? "cloud" : "local";
    const ossConfig = shouldUseOss(space, req);
    if (ossConfig) {
      await deleteOssPath(ossConfig, cleanRelativePath(payload.path));
      sendJson(res, 200, { ok: true, storage: "oss" });
      return;
    }
    const target = resolveWorkspacePath(space, payload.path);
    if (!fs.existsSync(target)) {
      sendJson(res, 404, { error: "File not found." });
      return;
    }
    fs.rmSync(target, { recursive: true, force: false });
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

async function handleFileRename(req, res) {
  try {
    const payload = JSON.parse(await readBody(req));
    const space = payload.space === "cloud" ? "cloud" : "local";
    const ossConfig = shouldUseOss(space, req);
    if (ossConfig) {
      const sourcePath = cleanRelativePath(payload.path);
      const targetPath = cleanRelativePath(path.posix.join(path.posix.dirname(sourcePath), safeFileName(payload.name)));
      const children = await listOssKeys(ossConfig, `${ossKey(ossConfig, sourcePath)}/`);
      if (children.length) {
        for (const childKey of children) {
          const childRelative = childKey.slice(ossConfig.prefix.length);
          const renamedChild = childRelative === `${sourcePath}/`
            ? `${targetPath}/`
            : cleanRelativePath(path.posix.join(targetPath, childRelative.slice(sourcePath.length + 1)));
          await copyOssObject(ossConfig, childRelative, renamedChild);
          await ossRequest(ossConfig, "DELETE", childKey);
        }
      } else {
        await copyOssObject(ossConfig, sourcePath, targetPath);
        await deleteOssObject(ossConfig, sourcePath);
      }
      sendJson(res, 200, { ok: true, storage: "oss" });
      return;
    }
    const source = resolveWorkspacePath(space, payload.path);
    const target = path.join(path.dirname(source), safeFileName(payload.name));
    if (!target.startsWith(`${fileBase(space)}${path.sep}`)) throw new Error("Invalid target path.");
    fs.renameSync(source, target);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

async function handleFileSync(req, res) {
  try {
    const payload = JSON.parse(await readBody(req));
    const sourceSpace = payload.source === "cloud" ? "cloud" : "local";
    const targetSpace = payload.target === "local" ? "local" : "cloud";
    const relativePath = cleanRelativePath(payload.path);
    const sourceOss = shouldUseOss(sourceSpace, req);
    const targetOss = shouldUseOss(targetSpace, req);
    if (sourceOss || targetOss) {
      if (sourceOss && targetSpace === "local") {
        const target = resolveWorkspacePath("local", relativePath);
        const children = await listOssKeys(sourceOss, `${ossKey(sourceOss, relativePath)}/`);
        if (children.length) {
          for (const childKey of children) {
            const childRelative = childKey.slice(sourceOss.prefix.length);
            const object = await getOssObject(sourceOss, childRelative);
            const childTarget = resolveWorkspacePath("local", childRelative);
            fs.mkdirSync(path.dirname(childTarget), { recursive: true });
            fs.writeFileSync(childTarget, object.data);
          }
        } else {
          const object = await getOssObject(sourceOss, relativePath);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, object.data);
        }
        sendJson(res, 200, { ok: true, target: relativePath, storage: "oss" });
        return;
      }
      if (targetOss && sourceSpace === "local") {
        const source = resolveWorkspacePath("local", relativePath);
        if (!fs.existsSync(source)) {
          sendJson(res, 404, { error: "Source not found." });
          return;
        }
        const stat = fs.statSync(source);
        if (stat.isDirectory()) {
          const stack = [source];
          while (stack.length) {
            const current = stack.pop();
            for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
              const entryPath = path.join(current, entry.name);
              if (entry.isDirectory()) {
                stack.push(entryPath);
              } else {
                const entryRelative = workspaceRelative(localFilesDir, entryPath);
                await putOssObject(targetOss, entryRelative, fs.readFileSync(entryPath), contentTypeForName(entry.name));
              }
            }
          }
        } else {
          await putOssObject(targetOss, relativePath, fs.readFileSync(source), contentTypeForName(path.basename(source)));
        }
        sendJson(res, 200, { ok: true, target: relativePath, storage: "oss" });
        return;
      }
    }
    const source = resolveWorkspacePath(sourceSpace, relativePath);
    const target = resolveWorkspacePath(targetSpace, relativePath);
    if (!fs.existsSync(source)) {
      sendJson(res, 404, { error: "Source not found." });
      return;
    }
    copyRecursive(source, target);
    sendJson(res, 200, { ok: true, target: relativePath });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

async function handleWorkspaceBackupUpload(req, res) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `workspace-backup-${stamp}.zip`;
  const relativePath = `backups/${fileName}`;
  const tempPath = path.join(tmpDir, fileName);
  try {
    fs.mkdirSync(localFilesDir, { recursive: true });
    await zipDirectory(localFilesDir, tempPath);
    const size = fs.statSync(tempPath).size;
    const ossConfig = shouldUseOss("cloud", req);
    if (ossConfig) {
      await putOssObject(ossConfig, relativePath, fs.readFileSync(tempPath), "application/zip");
      sendJson(res, 200, {
        ok: true,
        storage: "oss",
        path: relativePath,
        fileName,
        size,
        url: signOssDownloadUrl(ossConfig, relativePath)
      });
      return;
    }
    const target = resolveWorkspacePath("cloud", relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(tempPath, target);
    sendJson(res, 200, {
      ok: true,
      storage: "server-cloud",
      path: relativePath,
      fileName,
      size
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  } finally {
    try {
      if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
    } catch {}
  }
}

async function handleFileShare(req, res) {
  try {
    const payload = JSON.parse(await readBody(req));
    const relativePath = cleanRelativePath(payload.path);
    const ossConfig = shouldUseOss("cloud", req);
    if (ossConfig) {
      sendJson(res, 200, { url: signOssDownloadUrl(ossConfig, relativePath), storage: "oss" });
      return;
    }
    const target = resolveWorkspacePath("cloud", relativePath);
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      sendJson(res, 404, { error: "Cloud file not found." });
      return;
    }
    const token = crypto.randomBytes(18).toString("hex");
    const shares = loadShares();
    shares[token] = {
      path: relativePath,
      createdAt: new Date().toISOString()
    };
    saveShares(shares);
    sendJson(res, 200, { token, url: `/share/${token}` });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

async function handleSharedDownload(req, res) {
  try {
    const token = decodeURIComponent(req.url.replace(/^\/share\//, "").split("?")[0]);
    const shares = loadShares();
    const share = shares[token];
    if (!share) {
      send(res, 404, "Share link not found.");
      return;
    }
    const target = resolveWorkspacePath("cloud", share.path);
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      send(res, 404, "Shared file not found.");
      return;
    }
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(target)] || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(path.basename(target))}"`
    });
    fs.createReadStream(target).pipe(res);
  } catch (error) {
    send(res, 400, error.message);
  }
}

function synthesizeWindows(text, lang) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const normalized = text.replace(/\s+/g, " ").trim();
    const estimateMs = estimateTtsMs(normalized);
    const hash = crypto.createHash("sha1").update(`${lang}:${normalized}`).digest("hex").slice(0, 16);
    const outputName = `reader-${hash}.wav`;
    const outputPath = path.join(audioDir, outputName);
    if (fs.existsSync(outputPath)) {
      resolve({
        audioUrl: `/audio/${outputName}`,
        elapsedMs: 0,
        estimateMs,
        cached: true,
        engine: "Windows System.Speech.Synthesis.SpeechSynthesizer",
        voice: lang === "zh-CN" ? "Microsoft Huihui Desktop" : "Microsoft Zira Desktop"
      });
      return;
    }

    const textPath = path.join(tmpDir, `reader-${hash}.txt`);
    fs.writeFileSync(textPath, normalized, "utf8");

    const voice = lang === "zh-CN" ? "Microsoft Huihui Desktop" : "Microsoft Zira Desktop";
    const script = path.join(root, "synthesize-text.ps1");
    const child = spawn("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      script,
      "-TextFile",
      textPath,
      "-OutFile",
      outputPath,
      "-Voice",
      voice
    ], { windowsHide: true });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve({
          audioUrl: `/audio/${outputName}`,
          elapsedMs: Date.now() - startedAt,
          estimateMs,
          cached: false,
          engine: "Windows System.Speech.Synthesis.SpeechSynthesizer",
          voice
        });
      } else {
        reject(new Error(stderr || `TTS exited with code ${code}`));
      }
    });
  });
}

function piperVoiceForLang(lang) {
  if (lang === "zh-CN") {
    return { model: piperVoiceZh, config: piperConfigZh };
  }
  return { model: piperVoiceEn, config: piperConfigEn };
}

function isPiperConfigured(lang) {
  const voice = piperVoiceForLang(lang);
  return Boolean(piperBin && voice.model && fs.existsSync(piperBin) && fs.existsSync(voice.model));
}

function synthesizePiper(text, lang) {
  return new Promise((resolve, reject) => {
    const voice = piperVoiceForLang(lang);
    if (!piperBin) {
      reject(new Error("Piper is not configured. Set PIPER_BIN in .env."));
      return;
    }
    if (!voice.model) {
      reject(new Error(`Piper voice is not configured for ${lang}. Set ${lang === "zh-CN" ? "PIPER_VOICE_ZH" : "PIPER_VOICE_EN"}.`));
      return;
    }
    if (!fs.existsSync(piperBin)) {
      reject(new Error(`Piper binary not found: ${piperBin}`));
      return;
    }
    if (!fs.existsSync(voice.model)) {
      reject(new Error(`Piper voice model not found: ${voice.model}`));
      return;
    }

    const startedAt = Date.now();
    const normalized = text.replace(/\s+/g, " ").trim();
    const estimateMs = estimateTtsMs(normalized);
    const hash = crypto.createHash("sha1")
      .update(`piper:${lang}:${voice.model}:${voice.config}:${piperLengthScale}:${piperNoiseScale}:${piperNoiseW}:${normalized}`)
      .digest("hex")
      .slice(0, 16);
    const outputName = `piper-${hash}.wav`;
    const outputPath = path.join(audioDir, outputName);
    if (fs.existsSync(outputPath)) {
      resolve({
        audioUrl: `/audio/${outputName}`,
        elapsedMs: 0,
        estimateMs,
        cached: true,
        engine: "Piper TTS",
        voice: path.basename(voice.model)
      });
      return;
    }

    const args = ["--model", voice.model, "--output_file", outputPath];
    if (voice.config && fs.existsSync(voice.config)) args.push("--config", voice.config);
    if (piperLengthScale) args.push("--length_scale", piperLengthScale);
    if (piperNoiseScale) args.push("--noise_scale", piperNoiseScale);
    if (piperNoiseW) args.push("--noise_w", piperNoiseW);

    const child = spawn(piperBin, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve({
          audioUrl: `/audio/${outputName}`,
          elapsedMs: Date.now() - startedAt,
          estimateMs,
          cached: false,
          engine: "Piper TTS",
          voice: path.basename(voice.model)
        });
      } else {
        reject(new Error(stderr || `Piper exited with code ${code}`));
      }
    });
    child.stdin.end(`${normalized}\n`);
  });
}

async function synthesizeLocal(text, lang, options = {}) {
  const shouldTryPiper = options.provider === "piper" || localTtsProvider === "piper" || localTtsProvider === "auto";
  if (shouldTryPiper && isPiperConfigured(lang)) {
    try {
      return await synthesizePiper(text, lang);
    } catch (error) {
      const fallback = await synthesizeWindows(text, lang);
      return { ...fallback, fallbackFrom: `Piper TTS failed: ${error.message}` };
    }
  }
  return synthesizeWindows(text, lang);
}

function azureTtsUrl() {
  if (azureSpeechEndpoint) {
    return azureSpeechEndpoint.includes("/cognitiveservices/")
      ? azureSpeechEndpoint
      : `${azureSpeechEndpoint}/cognitiveservices/v1`;
  }
  if (!azureSpeechRegion) return "";
  return `https://${azureSpeechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;
}

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;"
  })[char]);
}

function normalizeAzureVoice(value, lang) {
  const voice = String(value || "").trim();
  if (/^en-(US|GB)-[A-Za-z]+Neural$/.test(voice)) return voice;
  if (lang === "en-GB") return "en-GB-SoniaNeural";
  return "en-US-JennyNeural";
}

function normalizeAzureRole(value) {
  const role = String(value || "").trim();
  const allowed = new Set([
    "Girl",
    "Boy",
    "YoungAdultFemale",
    "YoungAdultMale",
    "OlderAdultFemale",
    "OlderAdultMale",
    "SeniorFemale",
    "SeniorMale"
  ]);
  return allowed.has(role) ? role : "";
}

function azureSsml(text, options) {
  const voice = normalizeAzureVoice(options.voice, options.lang);
  const lang = voice.slice(0, 5);
  const rate = String(options.rate || "-8%").trim();
  const role = normalizeAzureRole(options.role);
  const prosody = `<prosody rate="${escapeXml(rate)}">${escapeXml(text)}</prosody>`;
  const content = role ? `<mstts:express-as role="${escapeXml(role)}">${prosody}</mstts:express-as>` : prosody;
  return [
    `<speak version="1.0" xml:lang="${lang}" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts">`,
    `<voice name="${escapeXml(voice)}">`,
    content,
    "</voice>",
    "</speak>"
  ].join("");
}

function synthesizeAzure(text, options) {
  return new Promise((resolve, reject) => {
    const url = azureTtsUrl();
    if (!azureSpeechKey || !url) {
      reject(new Error("Azure Speech is not configured. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION."));
      return;
    }
    const startedAt = Date.now();
    const normalized = text.replace(/\s+/g, " ").trim();
    const lang = options.lang === "en-GB" ? "en-GB" : "en-US";
    const voice = normalizeAzureVoice(options.voice, lang);
    const rate = String(options.rate || "-8%").trim();
    const role = normalizeAzureRole(options.role);
    const estimateMs = estimateTtsMs(normalized);
    const hash = crypto.createHash("sha1")
      .update(`azure:${azureTtsOutputFormat}:${lang}:${voice}:${rate}:${role}:${normalized}`)
      .digest("hex")
      .slice(0, 16);
    const outputName = `azure-${hash}.${azureTtsExtension}`;
    const outputPath = path.join(audioDir, outputName);
    if (fs.existsSync(outputPath)) {
      resolve({
        audioUrl: `/audio/${outputName}`,
        elapsedMs: 0,
        estimateMs,
        cached: true,
        engine: "Azure AI Speech",
        voice,
        role
      });
      return;
    }

    const target = new URL(url);
    const ssml = azureSsml(normalized, { lang, voice, rate, role });
    const request = https.request({
      method: "POST",
      hostname: target.hostname,
      port: target.port || 443,
      path: `${target.pathname}${target.search}`,
      headers: {
        "Ocp-Apim-Subscription-Key": azureSpeechKey,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": azureTtsOutputFormat,
        "User-Agent": "WordGarden",
        "Content-Length": Buffer.byteLength(ssml)
      }
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks);
        if (response.statusCode >= 400) {
          reject(new Error(`Azure TTS returned ${response.statusCode}: ${body.toString("utf8").slice(0, 500)}`));
          return;
        }
        fs.writeFileSync(outputPath, body);
        resolve({
          audioUrl: `/audio/${outputName}`,
          elapsedMs: Date.now() - startedAt,
          estimateMs,
          cached: false,
          engine: "Azure AI Speech",
          voice,
          role
        });
      });
    });
    request.setTimeout(aiRequestTimeoutMs, () => {
      request.destroy(new Error("Azure TTS request timed out."));
    });
    request.on("error", reject);
    request.write(ssml);
    request.end();
  });
}

function normalizeProviderVoice(value, provider) {
  const voice = String(value || "").trim();
  if (provider === "huabot") {
    return /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(voice) ? voice : "Amy";
  }
  const allowed = new Set([
    "alloy",
    "ash",
    "ballad",
    "coral",
    "echo",
    "fable",
    "nova",
    "onyx",
    "sage",
    "shimmer",
    "verse",
    "marin",
    "cedar"
  ]);
  return allowed.has(voice) ? voice : "coral";
}

function normalizeOpenAiFormat(value) {
  const format = String(value || openaiTtsFormat).trim().toLowerCase();
  const allowed = new Set(["mp3", "opus", "aac", "flac", "wav", "pcm"]);
  return allowed.has(format) ? format : "mp3";
}

function synthesizeOpenAiSpeech(text, options) {
  return new Promise((resolve, reject) => {
    const provider = options.provider === "huabot" ? "huabot" : options.provider === "openrouter" ? "openrouter" : "openai";
    const useOpenRouter = provider === "openrouter";
    const apiKey = provider === "huabot" ? huabotTtsApiKey : useOpenRouter ? openrouterApiKey : openaiApiKey;
    const baseUrl = provider === "huabot" ? huabotTtsBaseUrl : useOpenRouter ? openrouterBaseUrl : openaiBaseUrl;
    const model = provider === "huabot" ? huabotTtsModel : useOpenRouter ? openrouterTtsModel : openaiTtsModel;
    const engine = provider === "huabot" ? "Huabot TTS" : useOpenRouter ? "OpenRouter TTS" : "OpenAI TTS";
    if (!apiKey) {
      reject(new Error(`${engine} is not configured. Set ${provider === "huabot" ? "HUABOT_TTS_API_KEY, SANDBOX_AI_KEY, or HUABOT_OPENAI_API_KEY" : useOpenRouter ? "OPENROUTER_API_KEY" : "OPENAI_API_KEY"} on the server.`));
      return;
    }
    const startedAt = Date.now();
    const normalized = text.replace(/\s+/g, " ").trim();
    const voice = normalizeProviderVoice(options.voice, provider);
    const format = normalizeOpenAiFormat(options.format);
    const instructions = provider === "huabot" ? "" : String(options.instructions || "").slice(0, 1200);
    const speed = Number(options.speed || 0.9);
    const estimateMs = estimateTtsMs(normalized);
    const hash = crypto.createHash("sha1")
      .update(`${provider}:${baseUrl}:${model}:${voice}:${format}:${speed}:${instructions}:${normalized}`)
      .digest("hex")
      .slice(0, 16);
    const outputName = `${provider}-${hash}.${format === "pcm" ? "pcm" : format}`;
    const outputPath = path.join(audioDir, outputName);
    if (fs.existsSync(outputPath)) {
      resolve({
        audioUrl: `/audio/${outputName}`,
        elapsedMs: 0,
        estimateMs,
        cached: true,
        engine,
        model,
        voice
      });
      return;
    }

    const target = new URL(`${baseUrl}/audio/speech`);
    const speechPayload = {
      model,
      input: normalized,
      voice,
      response_format: format,
      speed: Math.max(0.25, Math.min(4, Number.isFinite(speed) ? speed : 0.9))
    };
    if (instructions) speechPayload.instructions = instructions;
    const payload = JSON.stringify(speechPayload);
    const client = target.protocol === "https:" ? https : http;
    const request = client.request({
      method: "POST",
      hostname: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        ...(useOpenRouter ? {
          "HTTP-Referer": openrouterSiteUrl,
          "X-Title": openrouterAppName
        } : {})
      }
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks);
        if (response.statusCode >= 400) {
          if (provider === "huabot" && voice !== "Emma" && !options._huabotFallback) {
            synthesizeOpenAiSpeech(text, { ...options, voice: "Emma", _huabotFallback: true }).then(resolve, reject);
            return;
          }
          reject(new Error(`${engine} returned ${response.statusCode}: ${body.toString("utf8").slice(0, 500)}`));
          return;
        }
        fs.writeFileSync(outputPath, body);
        resolve({
          audioUrl: `/audio/${outputName}`,
          elapsedMs: Date.now() - startedAt,
          estimateMs,
          cached: false,
          engine,
          model,
          voice
        });
      });
    });
    request.setTimeout(aiRequestTimeoutMs, () => {
      request.destroy(new Error("OpenAI TTS request timed out."));
    });
    request.on("error", reject);
    request.write(payload);
    request.end();
  });
}

function synthesize(text, lang, options = {}) {
  if (options.provider === "azure") {
    return synthesizeAzure(text, { ...options, lang });
  }
  if (options.provider === "openai") {
    return synthesizeOpenAiSpeech(text, options);
  }
  if (options.provider === "huabot") {
    return synthesizeOpenAiSpeech(text, options);
  }
  if (options.provider === "openrouter") {
    return synthesizeOpenAiSpeech(text, options);
  }
  return synthesizeLocal(text, lang, options);
}

function estimateTtsMs(text) {
  return Math.max(1200, Math.min(90000, 900 + text.length * 2.8));
}

async function handleTts(req, res) {
  try {
    const payload = JSON.parse(await readBody(req));
    const text = String(payload.text || "").trim();
    const lang = payload.lang === "zh-CN" ? "zh-CN" : payload.lang === "en-GB" ? "en-GB" : "en-US";
    const provider = payload.provider === "azure"
      ? "azure"
      : payload.provider === "openai"
        ? "openai"
        : payload.provider === "huabot"
          ? "huabot"
          : payload.provider === "openrouter"
            ? "openrouter"
            : payload.provider === "piper"
              ? "piper"
              : payload.provider === "windows"
                ? "windows"
                : "local";
    if (!text) {
      send(res, 400, JSON.stringify({ error: "Missing text." }), { "Content-Type": "application/json" });
      return;
    }
    const result = await synthesize(text.slice(0, 12000), lang, {
      provider,
      voice: payload.voice,
      rate: payload.rate,
      role: payload.role,
      instructions: payload.instructions,
      speed: payload.speed,
      format: payload.format
    });
    send(res, 200, JSON.stringify(result), { "Content-Type": "application/json" });
  } catch (error) {
    send(res, 500, JSON.stringify({ error: error.message }), { "Content-Type": "application/json" });
  }
}

function postJson(url, payload, headers = {}, timeoutMs = aiRequestTimeoutMs) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const body = JSON.stringify(payload);
    const client = target.protocol === "https:" ? https : http;
    const request = client.request({
      method: "POST",
      hostname: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        ...headers
      }
    }, (response) => {
      let data = "";
      response.on("data", (chunk) => {
        data += chunk;
      });
      response.on("end", () => {
        if (response.statusCode >= 400) {
          const error = new Error(`Remote service returned ${response.statusCode}: ${data.slice(0, 500)}`);
          error.statusCode = response.statusCode;
          error.remoteBody = data;
          reject(error);
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Remote service timed out after ${timeoutMs}ms`));
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function classifyAiError(error) {
  const message = String(error?.message || "");
  if (message.includes("not configured")) return "missing_api_key";
  if (message.includes("timed out") || message.includes("ETIMEDOUT")) return "timeout";
  if (message.includes("ENOTFOUND") || message.includes("ECONNREFUSED") || message.includes("ECONNRESET")) return "network";
  if (error?.statusCode === 401) return "invalid_api_key";
  if (error?.statusCode === 403) return "permission_or_region";
  if (error?.statusCode === 404) return "model_or_endpoint_not_found";
  if (error?.statusCode === 429) return "quota_or_rate_limit";
  if (error?.statusCode >= 400) return "provider_rejected_request";
  if (message.includes("valid JSON")) return "bad_model_json";
  return "unknown";
}

function logAiError(scope, error) {
  const entry = {
    ts: new Date().toISOString(),
    scope,
    code: classifyAiError(error),
    statusCode: error?.statusCode || null,
    message: String(error?.message || ""),
    remoteBody: error?.remoteBody ? safeRemoteBody(error.remoteBody) : ""
  };
  fs.appendFileSync(path.join(logsDir, "ai-errors.log"), `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

function safeRemoteBody(body) {
  return String(body)
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-***")
    .slice(0, 1500);
}

function aiErrorResponse(error, userMessage) {
  const logged = logAiError(userMessage, error);
  const code = classifyAiError(error);
  return {
    error: userMessage,
    code,
    model: openaiModel,
    keyConfigured: Boolean(openaiApiKey),
    statusCode: logged.statusCode,
    detail: process.env.NODE_ENV === "production" ? undefined : logged.remoteBody || String(error?.message || "")
  };
}

async function callOpenAiJson({ system, user, maxOutputTokens = 1800 }) {
  if (!openaiApiKey) {
    throw new Error("OpenAI API key is not configured on the server.");
  }
  const payload = {
    model: openaiModel,
    input: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    max_output_tokens: maxOutputTokens
  };
  if (supportsTemperature && Number.isFinite(openaiTemperature)) payload.temperature = openaiTemperature;
  let result;
  try {
    result = await postJson(`${openaiBaseUrl}/responses`, payload, {
      Authorization: `Bearer ${openaiApiKey}`
    });
  } catch (error) {
    if (payload.temperature !== undefined && String(error?.remoteBody || error?.message || "").includes("temperature")) {
      delete payload.temperature;
      result = await postJson(`${openaiBaseUrl}/responses`, payload, {
        Authorization: `Bearer ${openaiApiKey}`
      });
    } else {
      throw error;
    }
  }
  const text = extractOpenAiText(result);
  return {
    data: parseJsonText(text),
    rawText: text,
    usage: normalizeOpenAiUsage(result.usage),
    model: result.model || openaiModel
  };
}

async function transcribeAudio(audio, contentType) {
  if (!openaiApiKey) throw new Error("OpenAI API key is not configured on the server.");
  const mimeType = String(contentType || "audio/webm").split(";")[0];
  const extension = mimeType === "audio/wav" ? "wav" : mimeType === "audio/mp4" ? "m4a" : "webm";
  const form = new FormData();
  form.append("model", openaiTranscribeModel);
  form.append("language", "zh");
  form.append("file", new Blob([audio], { type: mimeType }), `speech.${extension}`);
  const response = await fetch(`${openaiBaseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiApiKey}` },
    body: form,
    signal: AbortSignal.timeout(aiRequestTimeoutMs)
  });
  const responseText = await response.text();
  if (!response.ok) {
    const error = new Error(`Transcription failed (${response.status}).`);
    error.statusCode = response.status;
    error.remoteBody = responseText;
    throw error;
  }
  const result = JSON.parse(responseText);
  return String(result.text || "").trim();
}

function extractOpenAiText(result) {
  if (result.output_text) return result.output_text;
  const chunks = [];
  for (const item of result.output || []) {
    for (const content of item.content || []) {
      if (content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("AI response was not valid JSON.");
  }
}

function normalizeOpenAiUsage(usage = {}) {
  const inputTokens = usage.input_tokens || usage.prompt_tokens || 0;
  const outputTokens = usage.output_tokens || usage.completion_tokens || 0;
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: usage.total_tokens || inputTokens + outputTokens
  };
}

function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 3.6) + 180;
}

async function translateText(text, direction = "en-to-zh") {
  const isChineseToEnglish = direction === "zh-to-en";
  const sourceLanguage = isChineseToEnglish ? "Simplified Chinese" : "English";
  const targetLanguage = isChineseToEnglish ? "natural English" : "Simplified Chinese";
  if (translateProvider === "openai") {
    const ai = await callOpenAiJson({
      system: [
        `You are a professional ${sourceLanguage}-to-${targetLanguage} translator for an English learning app.`,
        "Return strict JSON only.",
        "Return the translation in the translatedText field.",
        "Translate naturally and preserve the speaker's meaning and tone.",
        isChineseToEnglish
          ? "Use clear, idiomatic English that a learner can say in real conversation."
          : "Also extract up to 18 difficult English words useful for learners in difficultWords."
      ].join(" "),
      user: JSON.stringify({
        task: isChineseToEnglish ? "translate_spoken_chinese" : "translate_article",
        source_language: sourceLanguage,
        target_language: targetLanguage,
        text
      }),
      maxOutputTokens: Math.min(3800, Math.max(900, Math.ceil(text.length * 0.9)))
    });
    return {
      translatedText: ai.data.translatedText || ai.data.translation || "",
      difficultWords: ai.data.difficultWords || [],
      provider: `server:openai:${ai.model}`,
      usage: ai.usage
    };
  }
  if (translateProvider === "libretranslate") {
    if (!translateApiUrl) {
      throw new Error("Translation provider is not configured on the server.");
    }
    const result = await postJson(translateApiUrl, {
      q: text,
      source: isChineseToEnglish ? "zh" : "en",
      target: isChineseToEnglish ? "en" : "zh",
      format: "text",
      api_key: translateApiKey
    });
    return {
      translatedText: result.translatedText || result.translation || "",
      provider: "server:libretranslate"
    };
  }
  if (translateProvider === "custom") {
    if (!translateApiUrl) {
      throw new Error("Custom translation endpoint is not configured on the server.");
    }
    const result = await postJson(translateApiUrl, {
      text,
      source: isChineseToEnglish ? "zh-CN" : "en",
      target: isChineseToEnglish ? "en" : "zh-CN"
    }, translateApiKey ? { Authorization: `Bearer ${translateApiKey}` } : {});
    return {
      translatedText: result.translatedText || result.translation || result.text || "",
      provider: "server:custom"
    };
  }
  throw new Error(`Unsupported translation provider: ${translateProvider}`);
}

async function handleTranslate(req, res) {
  try {
    const payload = JSON.parse(await readBody(req));
    const text = String(payload.text || "").trim().slice(0, 12000);
    const direction = payload.direction === "zh-to-en" ? "zh-to-en" : "en-to-zh";
    if (!text) {
      send(res, 400, JSON.stringify({ error: "Missing text." }), { "Content-Type": "application/json" });
      return;
    }
    const startedAt = Date.now();
    const result = await translateText(text, direction);
    send(res, 200, JSON.stringify({
      translatedText: result.translatedText,
      difficultWords: result.difficultWords || [],
      elapsedMs: Date.now() - startedAt,
      provider: result.provider,
      usage: result.usage || null,
      chargedTokens: result.usage?.total_tokens || estimateTokens(text)
    }), { "Content-Type": "application/json" });
  } catch (error) {
    send(res, 503, JSON.stringify(aiErrorResponse(error, "Translation service is temporarily unavailable.")), { "Content-Type": "application/json" });
  }
}

async function handleSpeechTranslate(req, res) {
  try {
    const audio = await readBuffer(req, 12 * 1024 * 1024);
    if (audio.length < 1000) {
      send(res, 400, JSON.stringify({ error: "录音太短，请再说一次。" }), { "Content-Type": "application/json; charset=utf-8" });
      return;
    }
    const startedAt = Date.now();
    const transcript = await transcribeAudio(audio, req.headers["content-type"]);
    if (!transcript) {
      send(res, 422, JSON.stringify({ error: "没有识别到语音，请再说一次。" }), { "Content-Type": "application/json; charset=utf-8" });
      return;
    }
    const result = await translateText(transcript, "zh-to-en");
    send(res, 200, JSON.stringify({
      transcript,
      translatedText: result.translatedText,
      elapsedMs: Date.now() - startedAt,
      provider: result.provider
    }), { "Content-Type": "application/json; charset=utf-8" });
  } catch (error) {
    send(res, 503, JSON.stringify(aiErrorResponse(error, "语音识别或翻译服务暂时不可用。")), { "Content-Type": "application/json; charset=utf-8" });
  }
}

async function handleAiStory(req, res) {
  try {
    const payload = JSON.parse(await readBody(req));
    const ageRange = String(payload.ageRange || "6-8").slice(0, 20);
    const englishLevel = String(payload.englishLevel || "A2").slice(0, 10);
    const theme = String(payload.theme || "a gentle bedtime adventure").slice(0, 160);
    const targetWords = Array.isArray(payload.targetWords) ? payload.targetWords.slice(0, 12) : [];
    const startedAt = Date.now();
    const ai = await callOpenAiJson({
      system: [
        "You write safe, warm, age-appropriate bilingual bedtime stories for English learners.",
        "Return strict JSON only.",
        "Keep the story short and quick to generate.",
        "Keep language appropriate for children and avoid scary or unsafe content.",
        "Use target words naturally and include a small vocabulary section.",
        "JSON shape: {\"title\":\"...\",\"story_en\":\"120-180 words\",\"story_zh\":\"Chinese translation\",\"target_words\":[{\"word\":\"...\",\"meaning\":\"...\"}],\"quiz\":[{\"question\":\"...\",\"answer\":\"...\"}]}"
      ].join(" "),
      user: JSON.stringify({
        task: "generate_bedtime_story",
        ageRange,
        englishLevel,
        theme,
        targetWords
      }),
      maxOutputTokens: 950
    });
    send(res, 200, JSON.stringify({
      ...ai.data,
      elapsedMs: Date.now() - startedAt,
      provider: `server:openai:${ai.model}`,
      usage: ai.usage,
      chargedTokens: ai.usage.total_tokens
    }), { "Content-Type": "application/json" });
  } catch (error) {
    send(res, 503, JSON.stringify(aiErrorResponse(error, "AI story service is temporarily unavailable.")), { "Content-Type": "application/json" });
  }
}

async function handleAiExamples(req, res) {
  try {
    const payload = JSON.parse(await readBody(req));
    const word = String(payload.word || "").trim().slice(0, 60);
    const meaning = String(payload.meaning || "").trim().slice(0, 140);
    const phonetic = String(payload.phonetic || "").trim().slice(0, 80);
    const level = String(payload.level || "A2").slice(0, 10);
    const learnerProfile = String(payload.learnerProfile || "").slice(0, 80);
    const currentTopic = String(payload.currentTopic || "").slice(0, 80);
    const topics = Array.isArray(payload.topics) ? payload.topics.slice(0, 6).map((item) => String(item).slice(0, 30)) : [];
    const existingExamples = Array.isArray(payload.existingExamples) ? payload.existingExamples.slice(0, 5) : [];
    const shortTextContext = String(payload.shortTextContext || "").trim().slice(0, 1200);
    if (!word) {
      send(res, 400, JSON.stringify({ error: "Missing word." }), { "Content-Type": "application/json" });
      return;
    }
    const startedAt = Date.now();
    const ai = await callOpenAiJson({
      system: [
        "You generate realistic English example sentences for Chinese English learners.",
        "Return strict JSON only.",
        "The sentences must be short, natural, and scene-based, not dictionary-like.",
        "Use the target word exactly and naturally.",
        "Prefer everyday, school, travel, workplace, message, or spoken-English contexts based on the topic.",
        "Avoid stiff patterns like 'I want to learn the word ...' unless the word is about learning.",
        "Keep each English sentence under 14 words for A1/A2, under 18 words for B1/B2/C1.",
        "Use Simplified Chinese translations.",
        "JSON shape: {\"examples\":[{\"sentence\":\"...\",\"translation\":\"...\",\"scene\":\"short Chinese usage scene\"}]}"
      ].join(" "),
      user: JSON.stringify({
        task: "generate_contextual_word_examples",
        word,
        meaning,
        phonetic,
        level,
        learnerProfile,
        currentTopic,
        topics,
        existingExamples,
        optionalShortTextContext: shortTextContext,
        count: 3
      }),
      maxOutputTokens: 850
    });
    const examples = Array.isArray(ai.data.examples) ? ai.data.examples.slice(0, 3) : [];
    send(res, 200, JSON.stringify({
      examples,
      elapsedMs: Date.now() - startedAt,
      provider: `server:openai:${ai.model}`,
      usage: ai.usage,
      chargedTokens: ai.usage.total_tokens
    }), { "Content-Type": "application/json" });
  } catch (error) {
    send(res, 503, JSON.stringify(aiErrorResponse(error, "AI example service is temporarily unavailable.")), { "Content-Type": "application/json" });
  }
}

async function handleAiCardWords(req, res) {
  try {
    const payload = JSON.parse(await readBody(req));
    const seedWord = String(payload.seedWord || "").trim().slice(0, 60);
    const seedInput = String(payload.seedInput || seedWord).trim().slice(0, 80);
    const seedMeaning = String(payload.seedMeaning || "").trim().slice(0, 120);
    const level = String(payload.level || "A2").slice(0, 10);
    const mode = String(payload.mode || "mixed").slice(0, 20);
    const count = Math.max(4, Math.min(24, Number(payload.count) || 10));
    const topics = Array.isArray(payload.topics) ? payload.topics.slice(0, 6).map((item) => String(item).slice(0, 30)) : [];
    const customWords = Array.isArray(payload.customWords) ? payload.customWords.slice(0, 24).map((item) => String(item).slice(0, 60)) : [];
    const knownWords = Array.isArray(payload.knownWords) ? payload.knownWords.slice(0, 120) : [];
    if (!seedWord && !customWords.length) {
      send(res, 400, JSON.stringify({ error: "Missing seed word." }), { "Content-Type": "application/json" });
      return;
    }
    const startedAt = Date.now();
    const ai = await callOpenAiJson({
      system: [
        "You design printable vocabulary cards for Chinese English learners.",
        "Return strict JSON only.",
        "Generate words that are useful to compare and learn together.",
        "The user may provide a Simplified Chinese seed word or phrase. If seedInput or seedWord is Chinese, infer the intended concept and generate useful English vocabulary cards for that concept.",
        "customWords may also be Chinese. Convert each Chinese custom word or phrase into one natural English vocabulary card, preserving the user's intended meaning in Chinese fields.",
        "The card word field must be English. Put Chinese explanations only in meaning, translation, and optionally reason.",
        "For mode=topic, prefer same topic and similar CEFR level.",
        "For mode=spelling, prefer visually or phonetically confusable English words.",
        "For mode=mixed, balance same-topic, same-level, and spelling-confusable words.",
        "If customWords are provided, include them first and complete missing fields for them.",
        "Avoid duplicates and avoid offensive or unsafe words.",
        "Use Simplified Chinese meanings.",
        "JSON shape: {\"cards\":[{\"word\":\"...\",\"phonetic\":\"/.../\",\"meaning\":\"中文释义\",\"level\":\"A1/A2/B1/B2/C1\",\"topics\":[\"daily\"],\"sentence\":\"short English example\",\"translation\":\"中文例句翻译\",\"reason\":\"why this card belongs with the seed\"}]}"
      ].join(" "),
      user: JSON.stringify({
        task: "generate_printable_vocabulary_cards",
        seedWord,
        seedInput,
        seedMeaning,
        level,
        mode,
        count,
        topics,
        customWords,
        knownWords
      }),
      maxOutputTokens: Math.min(2200, 700 + count * 95)
    });
    const cards = Array.isArray(ai.data.cards) ? ai.data.cards.slice(0, count) : [];
    send(res, 200, JSON.stringify({
      cards,
      elapsedMs: Date.now() - startedAt,
      provider: `server:openai:${ai.model}`,
      usage: ai.usage,
      chargedTokens: ai.usage.total_tokens
    }), { "Content-Type": "application/json" });
  } catch (error) {
    send(res, 503, JSON.stringify(aiErrorResponse(error, "AI card word service is temporarily unavailable.")), { "Content-Type": "application/json" });
  }
}

function handleAiHealth(req, res) {
  send(res, 200, JSON.stringify({
    ok: Boolean(openaiApiKey),
    keyConfigured: Boolean(openaiApiKey),
    model: openaiModel,
    baseUrl: openaiBaseUrl,
    translateProvider,
    timeoutMs: aiRequestTimeoutMs,
    temperature: supportsTemperature && Number.isFinite(openaiTemperature) ? openaiTemperature : null
  }), { "Content-Type": "application/json" });
}

function handleAiLastError(req, res) {
  const file = path.join(logsDir, "ai-errors.log");
  if (!fs.existsSync(file)) {
    send(res, 200, JSON.stringify({ error: null }), { "Content-Type": "application/json" });
    return;
  }
  const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/).filter(Boolean);
  const last = lines.length ? JSON.parse(lines[lines.length - 1]) : null;
  send(res, 200, JSON.stringify({ error: last }), { "Content-Type": "application/json" });
}

function serveStatic(req, res) {
  const requestPath = decodeURIComponent(new URL(req.url, `http://localhost:${port}`).pathname);
  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(root, safePath);
  if (!filePath.startsWith(root)) {
    send(res, 403, "Forbidden");
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(res, 404, "Not found");
      return;
    }
    const ext = path.extname(filePath);
    const headers = { "Content-Type": mimeTypes[ext] || "application/octet-stream" };
    if ([".html", ".js", ".css"].includes(ext)) {
      headers["Cache-Control"] = "no-store";
    }
    send(res, 200, data, headers);
  });
}

function serveVoiceChat(req, res) {
  const requestPath = decodeURIComponent(new URL(req.url, `http://localhost:${port}`).pathname);
  if (requestPath === "/voicechat") {
    res.writeHead(302, { Location: "/voicechat/" });
    res.end();
    return;
  }
  let relativePath = requestPath.replace(/^\/voicechat\/?/, "") || "index.html";
  if (relativePath === "vad-v2" || relativePath.startsWith("vad-v2/")) {
    relativePath = relativePath.replace(/^vad-v2/, "vad");
  }
  const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(voiceChatDistDir, safePath);
  if (!filePath.startsWith(voiceChatDistDir)) {
    send(res, 403, "Forbidden");
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, "index.html");
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    filePath = path.join(voiceChatDistDir, "index.html");
  }
  if (!fs.existsSync(filePath)) {
    send(res, 503, "Voicechat has not been built. Run npm run build in the voicechat directory.");
    return;
  }
  const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  const isRuntimeAsset = safePath === "vad" || safePath.startsWith(`vad${path.sep}`);
  const headers = {
    "Content-Type": contentType,
    "Cache-Control": filePath.endsWith("index.html") || isRuntimeAsset
      ? "no-cache, must-revalidate"
      : "public, max-age=31536000, immutable"
  };
  res.writeHead(200, headers);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

function proxyVoiceChat(req, res) {
  const proxy = http.request({
    hostname: "127.0.0.1",
    port: voiceChatPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${voiceChatPort}` }
  }, (upstream) => {
    res.writeHead(upstream.statusCode || 502, upstream.headers);
    upstream.pipe(res);
  });
  proxy.setTimeout(180000, () => proxy.destroy(new Error("Voicechat request timed out.")));
  proxy.on("error", (error) => {
    if (!res.headersSent) send(res, 502, JSON.stringify({ error: `Voicechat service unavailable: ${error.message}` }), { "Content-Type": "application/json" });
    else res.end();
  });
  req.pipe(proxy);
}

function startVoiceChatService() {
  const healthRequest = http.get(`http://127.0.0.1:${voiceChatPort}/api/health`, (response) => {
    response.resume();
  });
  healthRequest.setTimeout(800, () => healthRequest.destroy());
  healthRequest.on("error", () => {
    voiceChatProcess = spawn(process.execPath, [path.join(voiceChatDir, "server", "index.js")], {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(voiceChatPort),
        HOST: "127.0.0.1",
        OPENAI_API_KEY: openaiApiKey,
        OPENAI_REQUEST_TIMEOUT_MS: String(aiRequestTimeoutMs),
        WEB_SEARCH_ENABLED: process.env.WEB_SEARCH_ENABLED || "true",
        WEB_SEARCH_MODE: process.env.WEB_SEARCH_MODE || "auto",
        WEB_SEARCH_PROVIDER: process.env.WEB_SEARCH_PROVIDER || "bing",
        WEB_SEARCH_MAX_RESULTS: process.env.WEB_SEARCH_MAX_RESULTS || "5",
        WEB_SEARCH_TIMEOUT_MS: process.env.WEB_SEARCH_TIMEOUT_MS || "10000"
      },
      windowsHide: true,
      stdio: "ignore"
    });
    voiceChatProcess.on("error", (error) => console.error(`Unable to start voicechat: ${error.message}`));
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/chat/") || req.url.startsWith("/api/practice/")) {
    proxyVoiceChat(req, res);
    return;
  }
  if ((req.method === "GET" || req.method === "HEAD") && (req.url === "/voicechat" || req.url.startsWith("/voicechat/"))) {
    serveVoiceChat(req, res);
    return;
  }
  if (req.method === "GET" && req.url.startsWith("/api/files/oss-health")) {
    handleOssHealth(req, res);
    return;
  }
  if (req.method === "GET" && req.url.startsWith("/api/files/list")) {
    handleFileList(req, res);
    return;
  }
  if (req.method === "POST" && req.url.startsWith("/api/files/upload")) {
    handleFileUpload(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/files/folder") {
    handleFileFolder(req, res);
    return;
  }
  if (req.method === "GET" && req.url.startsWith("/api/files/download")) {
    handleFileDownload(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/files/delete") {
    handleFileDelete(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/files/rename") {
    handleFileRename(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/files/sync") {
    handleFileSync(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/files/backup-upload") {
    handleWorkspaceBackupUpload(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/files/share") {
    handleFileShare(req, res);
    return;
  }
  if (req.method === "GET" && req.url.startsWith("/share/")) {
    handleSharedDownload(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/tts") {
    handleTts(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/translate") {
    handleTranslate(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/speech-translate") {
    handleSpeechTranslate(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/ai/story") {
    handleAiStory(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/ai/examples") {
    handleAiExamples(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/ai/card-words") {
    handleAiCardWords(req, res);
    return;
  }
  if (req.method === "GET" && req.url === "/api/ai/health") {
    handleAiHealth(req, res);
    return;
  }
  if (req.method === "GET" && req.url === "/api/ai/last-error") {
    handleAiLastError(req, res);
    return;
  }
  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }
  send(res, 405, "Method not allowed");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Word Garden running at http://127.0.0.1:${port}`);
  startVoiceChatService();
});

process.on("exit", () => voiceChatProcess?.kill());
