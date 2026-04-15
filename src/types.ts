export type ModelPreset = {
  id: string;
  name: string;
  workflow_file: string;
  description?: string | null;
};

export type GenerationStatus = 'queued' | 'running' | 'completed' | 'failed';

export type Generation = {
  id: string;
  title?: string | null;
  prompt: string;
  lyrics?: string | null;
  tags?: string | null;
  model_preset_id: string;
  bpm?: number | null;
  duration?: number | null;
  timesignature?: string | null;
  language?: string | null;
  keyscale?: string | null;
  seed?: number | null;
  temperature?: number | null;
  cfg_scale?: number | null;
  status: GenerationStatus;
  output_audio_path?: string | null;
  output_audio_url?: string | null;
  output_audio_size?: number | null;
  cover_image_path?: string | null;
  cover_image_url?: string | null;
  cover_image_size?: number | null;
  cover_prompt?: string | null;
  cover_negative_prompt?: string | null;
  cover_status?: 'running' | 'completed' | 'failed' | null;
  cover_error_message?: string | null;
  workflow_path?: string | null;
  error_message?: string | null;
  comfyui_prompt_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type PromptAssistResponse = {
  tags: string;
  lyrics: string;
};

export type PromptIdeaResponse = {
  prompt: string;
  tags: string;
  lyrics: string;
};

export type PromptLyricsResponse = {
  lyrics: string;
};

export type PromptMetadataResponse = {
  bpm: number;
  duration: number;
  timesignature: string;
  language: string;
  keyscale: string;
  seed: number;
  temperature: number;
  cfg_scale: number;
};

export type PromptTitleResponse = {
  title: string;
};
