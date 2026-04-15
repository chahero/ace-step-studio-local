import type {
  Generation,
  ModelPreset,
  PromptAssistResponse,
  PromptIdeaResponse,
  PromptLyricsResponse,
  PromptMetadataResponse,
  PromptTitleResponse,
} from './types';

const API_BASE_URL = 'http://127.0.0.1:8001/api';

async function requestJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined && init?.body !== null;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text) as { detail?: string };
      throw new Error(parsed.detail || `Request failed: ${response.status}`);
    } catch {
      throw new Error(text || `Request failed: ${response.status}`);
    }
  }

  return (await response.json()) as T;
}

export async function loadModels(): Promise<ModelPreset[]> {
  return requestJSON<ModelPreset[]>('/models');
}

export async function loadGenerations(): Promise<Generation[]> {
  return requestJSON<Generation[]>('/generations');
}

export async function createGeneration(input: Record<string, unknown>): Promise<Generation> {
  return requestJSON<Generation>('/generations', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function retryGeneration(id: string): Promise<Generation> {
  return requestJSON<Generation>(`/generations/${id}/retry`, {
    method: 'POST',
  });
}

export async function deleteGeneration(id: string): Promise<{ deleted: true; id: string }> {
  return requestJSON<{ deleted: true; id: string }>(`/generations/${id}`, {
    method: 'DELETE',
  });
}

export async function assistPrompt(input: Record<string, unknown>): Promise<PromptAssistResponse> {
  return requestJSON<PromptAssistResponse>('/prompt/assist', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function generatePromptIdea(input: Record<string, unknown>): Promise<PromptIdeaResponse> {
  return requestJSON<PromptIdeaResponse>('/prompt/idea', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function generatePromptLyrics(input: Record<string, unknown>): Promise<PromptLyricsResponse> {
  return requestJSON<PromptLyricsResponse>('/prompt/lyrics', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function generatePromptMetadata(input: Record<string, unknown>): Promise<PromptMetadataResponse> {
  return requestJSON<PromptMetadataResponse>('/prompt/metadata', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function generatePromptTitle(input: Record<string, unknown>): Promise<PromptTitleResponse> {
  return requestJSON<PromptTitleResponse>('/prompt/title', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
