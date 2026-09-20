export type Role = 'user' | 'assistant';
export type VoiceStatus = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export type ChatMessage = {
  id: string;
  role: Role;
  text: string;
  translation?: string;
  createdAt: string;
  language?: string;
  sources?: SearchSource[];
};

export type SearchSource = { title: string; url: string; snippet: string };
export type MusicTrack = { query: string; title: string; url: string; bvid: string; playUrl: string; index?: number };

export type ChatResult = {
  assistantText: string;
  userTranslation?: string;
  assistantTranslation?: string;
  audio: string;
  mimeType: string;
  transcript?: string;
  language?: string;
  sources?: SearchSource[];
  music?: MusicTrack;
};
