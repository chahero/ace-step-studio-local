export type ModelPreset = {
  id: string;
  name: string;
  workflow_file: string;
  description?: string | null;
};

export type GenerationStatus = 'queued' | 'running' | 'completed' | 'failed';

export type Generation = {
  id: string;
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
