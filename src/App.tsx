import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  createGeneration,
  deleteGeneration,
  generateCover,
  generatePromptIdea,
  generatePromptLyrics,
  generatePromptMetadata,
  generatePromptTitle,
  loadGenerations,
  loadModels,
  retryGeneration,
} from './api';
import type { Generation, ModelPreset } from './types';

const defaultForm = {
  title: '',
  prompt: '',
  lyrics: '',
  tags: '',
  genre_category: '',
  model_preset_id: '',
  bpm: 72,
  duration: 120,
  timesignature: '4',
  language: 'en',
  keyscale: 'E minor',
  seed: 0,
  temperature: 0.85,
  cfg_scale: 2,
};

const API_ROOT = 'http://127.0.0.1:8001';
const SIDEBAR_MIN = 400;
const SIDEBAR_MAX = 920;
const DEFAULT_SIDEBAR_WIDTH = 520;
const DETAIL_PANEL_WIDTH = 340;
type LibraryStatusFilter = 'all' | Generation['status'];
type LibrarySortMode = 'newest' | 'oldest';

const presetLibrary = {
  base: {
    id: 'base',
    name: 'Base',
    description: 'Balanced, general-purpose starting point for ambient, cinematic, and vocal tracks.',
    prompt: 'A warm, intimate ambient track with soft vocals and slow evolution.',
    bpm: 72,
    duration: 120,
    timesignature: '4',
    language: 'en',
    keyscale: 'E minor',
    seed: 0,
    temperature: 0.85,
    cfg_scale: 2,
    tags: 'ambient, intimate, cinematic, warm, slow-burn, soft vocals',
  },
  sft: {
    id: 'sft',
    name: 'SFT',
    description: 'More polished and structured. Good for melodic, soulful, and song-like results.',
    prompt: 'A lush neo-soul track with warm keys, expressive vocals, and rich harmonic movement.',
    bpm: 120,
    duration: 120,
    timesignature: '4',
    language: 'en',
    keyscale: 'E minor',
    seed: 0,
    temperature: 0.82,
    cfg_scale: 2,
    tags: 'neo-soul, warm rhodes, expressive female vocal, mellow groove, analog texture',
  },
  turbo: {
    id: 'turbo',
    name: 'Turbo',
    description: 'Fast, punchy, and more experimental. Useful for quick iteration and bold ideas.',
    prompt: 'A late-night trap song with heavy 808 bass, wet synths, and seductive vocal layers.',
    bpm: 95,
    duration: 90,
    timesignature: '4',
    language: 'en',
    keyscale: 'E minor',
    seed: 0,
    temperature: 0.9,
    cfg_scale: 2,
    tags: 'late night trap, heavy 808 bass, dark bedroom production, atmospheric club vibes',
  },
} as const;

const soundPalette = [
  'ambient',
  'cinematic',
  'lo-fi',
  'jazz-hop',
  'neo-soul',
  'synthwave',
  'dream-pop',
  'vaporwave',
  'trap',
  'house',
  'techno',
  'acoustic',
  'orchestral',
  'experimental',
  'folk',
  'r&b',
  'vocal',
  'warm',
  'dark',
  'minimal',
  'ethereal',
  'gritty',
  'drift',
];

const genreCategories = [
  'Pop',
  'K-pop',
  'J-pop',
  'Hip-Hop / Trap',
  'R&B / Soul',
  'Electronic',
  'Rock',
  'Ambient / Cinematic',
] as const;

const languageOptions = [
  { value: 'en', label: 'EN', fullLabel: 'English' },
  { value: 'ko', label: 'KO', fullLabel: 'Korean' },
  { value: 'ja', label: 'JA', fullLabel: 'Japanese' },
  { value: 'zh', label: 'ZH', fullLabel: 'Chinese' },
  { value: 'es', label: 'ES', fullLabel: 'Spanish' },
  { value: 'fr', label: 'FR', fullLabel: 'French' },
  { value: 'de', label: 'DE', fullLabel: 'German' },
];

const keyOptions = [
  'C major',
  'C# major',
  'Db major',
  'D major',
  'D# major',
  'Eb major',
  'E major',
  'F major',
  'F# major',
  'Gb major',
  'G major',
  'G# major',
  'Ab major',
  'A major',
  'A# major',
  'Bb major',
  'B major',
  'C minor',
  'C# minor',
  'Db minor',
  'D minor',
  'D# minor',
  'Eb minor',
  'E minor',
  'F minor',
  'F# minor',
  'Gb minor',
  'G minor',
  'G# minor',
  'Ab minor',
  'A minor',
  'A# minor',
  'Bb minor',
  'B minor',
] as const;

function splitTags(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function formatAudioTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function DiceIcon() {
  return (
    <span className="dice-icon" aria-hidden="true">
      ✦
    </span>
  );
}

function PrevIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 6v12" />
      <path d="M17 7 10.5 12 17 17Z" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17 6v12" />
      <path d="M7 7 13.5 12 7 17Z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M9 7.5 17 12l-8 4.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M9 7h2.5v10H9z" />
      <path fill="currentColor" d="M12.5 7H15v10h-2.5z" />
    </svg>
  );
}

function OpenIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 5h5v5" />
      <path d="M10 14 19 5" />
      <path d="M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 11a8 8 0 1 0 2.2 5.5" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M8 7l1 12h6l1-12" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function CoverIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 6h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" />
      <path d="m8 15 2.5-2.8 2.2 2.2 1.8-1.7L17 15" />
      <path d="M9 10h.01" />
    </svg>
  );
}

function RepeatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17 2l3 3-3 3" />
      <path d="M3 11V9a4 4 0 0 1 4-4h13" />
      <path d="M7 22l-3-3 3-3" />
      <path d="M21 13v2a4 4 0 0 1-4 4H4" />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6" cy="12" r="1.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <circle cx="18" cy="12" r="1.8" fill="currentColor" />
    </svg>
  );
}

export default function App() {
  const [models, setModels] = useState<ModelPreset[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(false);
  const [captionLoading, setCaptionLoading] = useState(false);
  const [titleLoading, setTitleLoading] = useState(false);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [randomizeLoading, setRandomizeLoading] = useState(false);
  const [coverRequestLoading, setCoverRequestLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerVolume, setPlayerVolume] = useState(0.8);
  const [isRepeatEnabled, setIsRepeatEnabled] = useState(false);
  const [isCaptionFocused, setIsCaptionFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [activeGenerationId, setActiveGenerationId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryStatusFilter, setLibraryStatusFilter] = useState<LibraryStatusFilter>('all');
  const [librarySortMode, setLibrarySortMode] = useState<LibrarySortMode>('newest');
  const [isLibrarySortMenuOpen, setIsLibrarySortMenuOpen] = useState(false);
  const [selectedGenerationIds, setSelectedGenerationIds] = useState<string[]>([]);
  const [openHistoryMenuId, setOpenHistoryMenuId] = useState<string | null>(null);
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [isKeyMenuOpen, setIsKeyMenuOpen] = useState(false);
  const [isTimeSignatureMenuOpen, setIsTimeSignatureMenuOpen] = useState(false);
  const [playerCurrentTime, setPlayerCurrentTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [shouldAutoplayOnLoad, setShouldAutoplayOnLoad] = useState(false);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [lightboxTitle, setLightboxTitle] = useState('');
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const keyMenuRef = useRef<HTMLDivElement | null>(null);
  const librarySortMenuRef = useRef<HTMLDivElement | null>(null);
  const timeSignatureMenuRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [modelData, generationData] = await Promise.all([loadModels(), loadGenerations()]);
        setModels(modelData);
        setGenerations(generationData);
        setForm((current) => ({
          ...current,
          model_preset_id: current.model_preset_id || modelData[0]?.id || '',
        }));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed to load studio data');
      }
    })();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshGenerations().catch(() => undefined);
    }, 3000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const savedWidth = window.localStorage.getItem('ace-step-sidebar-width');
    if (!savedWidth) {
      return;
    }

    const parsedWidth = Number(savedWidth);
    if (Number.isFinite(parsedWidth)) {
      setSidebarWidth(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, parsedWidth)));
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('ace-step-sidebar-width', String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const elementTarget = event.target as HTMLElement | null;
      if (languageMenuRef.current && target && !languageMenuRef.current.contains(target)) {
        setIsLanguageMenuOpen(false);
      }
      if (keyMenuRef.current && target && !keyMenuRef.current.contains(target)) {
        setIsKeyMenuOpen(false);
      }
      if (librarySortMenuRef.current && target && !librarySortMenuRef.current.contains(target)) {
        setIsLibrarySortMenuOpen(false);
      }
      if (timeSignatureMenuRef.current && target && !timeSignatureMenuRef.current.contains(target)) {
        setIsTimeSignatureMenuOpen(false);
      }
      if (!elementTarget?.closest('.history-menu-wrap')) {
        setOpenHistoryMenuId(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  useEffect(() => {
    if (!lightboxImageUrl) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLightboxImageUrl(null);
        setLightboxTitle('');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [lightboxImageUrl]);

  const activeGeneration = useMemo(
    () => generations.find((generation) => generation.id === activeGenerationId) ?? generations[0] ?? null,
    [activeGenerationId, generations],
  );

  const filteredGenerations = useMemo(() => {
    const search = librarySearch.trim().toLowerCase();
    return generations
      .filter((generation) => {
        const matchesStatus = libraryStatusFilter === 'all' || generation.status === libraryStatusFilter;
        const haystack = [generation.title, generation.prompt, generation.tags, generation.model_preset_id, generation.language]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        const matchesSearch = !search || haystack.includes(search);
        return matchesStatus && matchesSearch;
      })
      .sort((left, right) => {
        const leftTime = new Date(left.created_at).getTime();
        const rightTime = new Date(right.created_at).getTime();
        return librarySortMode === 'newest' ? rightTime - leftTime : leftTime - rightTime;
      });
  }, [generations, librarySearch, librarySortMode, libraryStatusFilter]);

  const activeGenerationIndex = useMemo(
    () => filteredGenerations.findIndex((generation) => generation.id === activeGeneration?.id),
    [activeGeneration, filteredGenerations],
  );

  const selectedVisibleCount = useMemo(
    () => filteredGenerations.filter((generation) => selectedGenerationIds.includes(generation.id)).length,
    [filteredGenerations, selectedGenerationIds],
  );

  const allVisibleSelected = filteredGenerations.length > 0 && selectedVisibleCount === filteredGenerations.length;

  useEffect(() => {
    const validIds = new Set(generations.map((generation) => generation.id));
    setSelectedGenerationIds((current) => current.filter((id) => validIds.has(id)));
  }, [generations]);

  async function refreshGenerations() {
    const data = await loadGenerations();
    setGenerations(data);
  }

  async function onGenerate() {
    setLoading(true);
    setError(null);

    try {
      const title = form.title.trim();
      if (!title) {
        throw new Error('Title is required');
      }

      const { genre_category: _genreCategory, ...generationForm } = form;

      await createGeneration({
        ...generationForm,
        title,
        seed: generationForm.seed || null,
        lyrics: generationForm.lyrics || null,
        tags: generationForm.prompt || null,
      });
      await refreshGenerations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Generation request failed');
    } finally {
      setLoading(false);
    }
  }

  async function onGenerateCaption() {
    setCaptionLoading(true);
    setError(null);

    try {
      const response = await generatePromptIdea({
        prompt: form.prompt,
        language: form.language,
        model_preset_id: form.model_preset_id,
        genre_category: form.genre_category || null,
      });

      setForm((current) => ({
        ...current,
        prompt: [response.prompt, response.tags].filter(Boolean).join(', ') || current.prompt,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Caption generation failed');
    } finally {
      setCaptionLoading(false);
    }
  }

  async function onGenerateTitle() {
    setTitleLoading(true);
    setError(null);

    try {
      const response = await generatePromptTitle({
        prompt: form.prompt,
        lyrics: form.lyrics,
        genre_category: form.genre_category || null,
        metadata: {
          bpm: form.bpm,
          duration: form.duration,
          timesignature: form.timesignature,
          language: form.language,
          keyscale: form.keyscale,
          seed: form.seed,
          temperature: form.temperature,
          cfg_scale: form.cfg_scale,
        },
      });

      setForm((current) => ({
        ...current,
        title: response.title || current.title,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Title suggestion failed');
    } finally {
      setTitleLoading(false);
    }
  }

  async function onGenerateLyrics() {
    setLyricsLoading(true);
    setError(null);

    try {
      const response = await generatePromptLyrics({
        prompt: form.prompt,
        language: form.language,
        genre_category: form.genre_category || null,
        bpm: form.bpm || null,
        duration: form.duration || null,
        timesignature: form.timesignature,
        keyscale: form.keyscale,
      });

      setForm((current) => ({
        ...current,
        lyrics: response.lyrics || current.lyrics,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Lyrics generation failed');
    } finally {
      setLyricsLoading(false);
    }
  }

  async function onGenerateMetadata() {
    setMetadataLoading(true);
    setError(null);

    try {
      const response = await generatePromptMetadata({
        prompt: form.prompt,
        lyrics: form.lyrics,
        language: form.language,
        genre_category: form.genre_category || null,
      });

      setForm((current) => ({
        ...current,
        bpm: response.bpm ?? current.bpm,
        duration: response.duration ?? current.duration,
        timesignature: response.timesignature || current.timesignature,
        language: response.language || current.language,
        keyscale: response.keyscale || current.keyscale,
        seed: response.seed ?? current.seed,
        temperature: response.temperature ?? current.temperature,
        cfg_scale: response.cfg_scale ?? current.cfg_scale,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Metadata suggestion failed');
    } finally {
      setMetadataLoading(false);
    }
  }

  async function onRandomizeAll() {
    setRandomizeLoading(true);
    setError(null);

    try {
      const presetIds = Object.keys(presetLibrary) as Array<keyof typeof presetLibrary>;
      const randomPresetId = presetIds[Math.floor(Math.random() * presetIds.length)] ?? 'base';
      const preset = presetLibrary[randomPresetId];

      const captionResponse = await generatePromptIdea({
        prompt: '',
        lyrics: '',
        language: preset.language,
        model_preset_id: randomPresetId,
        genre_category: form.genre_category || null,
      });

      const nextPrompt = [captionResponse.prompt, captionResponse.tags].filter(Boolean).join(', ').trim() || preset.prompt;

      const metadataResponse = await generatePromptMetadata({
        prompt: nextPrompt,
        lyrics: '',
        language: preset.language,
        genre_category: form.genre_category || null,
      });

      const nextMetadata = {
        bpm: metadataResponse.bpm ?? preset.bpm,
        duration: metadataResponse.duration ?? preset.duration,
        timesignature: metadataResponse.timesignature || preset.timesignature,
        language: metadataResponse.language || preset.language,
        keyscale: metadataResponse.keyscale || preset.keyscale,
        seed: metadataResponse.seed ?? preset.seed,
        temperature: metadataResponse.temperature ?? preset.temperature,
        cfg_scale: metadataResponse.cfg_scale ?? preset.cfg_scale,
      };

      const lyricsResponse = await generatePromptLyrics({
        prompt: nextPrompt,
        language: nextMetadata.language,
        genre_category: form.genre_category || null,
        bpm: nextMetadata.bpm,
        duration: nextMetadata.duration,
        timesignature: nextMetadata.timesignature,
        keyscale: nextMetadata.keyscale,
      });

      const nextLyrics = lyricsResponse.lyrics?.trim() || captionResponse.lyrics?.trim() || '';

      const titleResponse = await generatePromptTitle({
        prompt: nextPrompt,
        lyrics: nextLyrics,
        genre_category: form.genre_category || null,
        metadata: nextMetadata,
      });

      setForm((current) => ({
        ...current,
        model_preset_id: randomPresetId,
        title: titleResponse.title?.trim() || current.title,
        prompt: nextPrompt,
        lyrics: nextLyrics,
        bpm: nextMetadata.bpm,
        duration: nextMetadata.duration,
        timesignature: nextMetadata.timesignature,
        language: nextMetadata.language,
        keyscale: nextMetadata.keyscale,
        seed: nextMetadata.seed,
        temperature: nextMetadata.temperature,
        cfg_scale: nextMetadata.cfg_scale,
        tags: preset.tags,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Randomize failed');
    } finally {
      setRandomizeLoading(false);
    }
  }

  async function onRetry(id: string) {
    setError(null);

    try {
      await retryGeneration(id);
      await refreshGenerations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Retry failed');
    }
  }

  async function onDelete(id: string) {
    setError(null);
    setOpenHistoryMenuId(null);

    const confirmed = window.confirm('Delete this generation and its local files?');
    if (!confirmed) {
      return;
    }

    try {
      await deleteGeneration(id);
      if (activeGenerationId === id) {
        setActiveGenerationId(null);
        setIsDetailPanelOpen(false);
      }
      await refreshGenerations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delete failed');
    }
  }

  function toggleGenerationSelection(id: string) {
    setSelectedGenerationIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleSelectAllVisible() {
    const visibleIds = filteredGenerations.map((generation) => generation.id);
    if (allVisibleSelected) {
      setSelectedGenerationIds((current) => current.filter((id) => !visibleIds.includes(id)));
      return;
    }

    setSelectedGenerationIds((current) => Array.from(new Set([...current, ...visibleIds])));
  }

  async function onDeleteSelected() {
    setError(null);

    const selectedGenerations = generations.filter((generation) => selectedGenerationIds.includes(generation.id));
    const deletable = selectedGenerations.filter((generation) => generation.status !== 'running');
    const skipped = selectedGenerations.length - deletable.length;

    if (deletable.length === 0) {
      setError(skipped > 0 ? 'Running songs cannot be deleted.' : 'No songs selected.');
      return;
    }

    const confirmed = window.confirm(`Delete ${deletable.length} selected song(s) and their local files?`);
    if (!confirmed) {
      return;
    }

    try {
      await Promise.all(deletable.map((generation) => deleteGeneration(generation.id)));
      if (activeGenerationId && deletable.some((generation) => generation.id === activeGenerationId)) {
        setActiveGenerationId(null);
        setIsDetailPanelOpen(false);
      }
      setSelectedGenerationIds((current) => current.filter((id) => !deletable.some((generation) => generation.id === id)));
      await refreshGenerations();
      if (skipped > 0) {
        setError(`${skipped} running song(s) were skipped.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bulk delete failed');
    }
  }

  async function onGenerateCover(id: string) {
    setError(null);
    setOpenHistoryMenuId(null);
    setCoverRequestLoading(true);

    try {
      await generateCover(id);
      await refreshGenerations();
      if (activeGenerationId !== id) {
        setActiveGenerationId(id);
      }
      setIsDetailPanelOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Cover generation failed');
    } finally {
      setCoverRequestLoading(false);
    }
  }

  function applyPreset(presetId: keyof typeof presetLibrary) {
    const preset = presetLibrary[presetId];
    setForm((current) => ({
      ...current,
      model_preset_id: presetId,
      bpm: preset.bpm,
      duration: preset.duration,
      timesignature: preset.timesignature,
      language: preset.language,
      keyscale: preset.keyscale,
      seed: preset.seed,
      temperature: preset.temperature,
      cfg_scale: preset.cfg_scale,
      tags: preset.tags,
    }));
  }

  function toggleSoundTag(tag: string) {
    setForm((current) => {
      const tags = splitTags(current.prompt);
      const normalizedTag = tag.trim();
      const nextTags = tags.includes(normalizedTag)
        ? tags.filter((existingTag) => existingTag !== normalizedTag)
        : [...tags, normalizedTag];

      return {
        ...current,
        prompt: nextTags.join(', '),
      };
    });
  }

  const selectedModel = models.find((model) => model.id === form.model_preset_id) ?? models[0] ?? null;
  const generationCounts = {
    queued: generations.filter((generation) => generation.status === 'queued').length,
    running: generations.filter((generation) => generation.status === 'running').length,
    completed: generations.filter((generation) => generation.status === 'completed').length,
    failed: generations.filter((generation) => generation.status === 'failed').length,
  };

  function getAudioUrl(generation?: Generation | null) {
    return generation?.output_audio_url ?? null;
  }

  function renderArtwork(generation?: Generation | null, className = '') {
    const coverImageUrl = generation?.cover_image_url ?? null;
    if (coverImageUrl) {
      return <img className={className} src={coverImageUrl} alt={generation?.title ?? generation?.prompt ?? 'Cover image'} />;
    }
    return <div className={className} aria-hidden="true" />;
  }

  function getDownloadUrl(generationId: string) {
    return `${API_ROOT}/api/generations/${generationId}/download`;
  }

  function openLightbox(imageUrl: string, title: string) {
    setLightboxImageUrl(imageUrl);
    setLightboxTitle(title);
  }

  const currentAudioUrl = getAudioUrl(activeGeneration);
  const currentTitle = activeGeneration?.title ?? activeGeneration?.prompt ?? 'No song selected';
  const currentMeta = activeGeneration
    ? `${activeGeneration.model_preset_id} · ${activeGeneration.duration ?? '-'} sec · ${activeGeneration.bpm ?? '-'} BPM`
    : 'Select a song from the library';

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const syncPlaybackState = () => {
      setPlayerCurrentTime(audio.currentTime || 0);
      setPlayerDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };

    const onTimeUpdate = () => {
      setPlayerCurrentTime(audio.currentTime || 0);
    };

    const onLoadedMetadata = () => {
      setPlayerDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      if (shouldAutoplayOnLoad) {
        void audio.play().catch(() => undefined);
        setShouldAutoplayOnLoad(false);
      }
    };

    audio.pause();
    audio.load();
    setIsPlaying(false);
    setPlayerCurrentTime(0);
    setPlayerDuration(0);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', syncPlaybackState);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', syncPlaybackState);
    };
  }, [currentAudioUrl, shouldAutoplayOnLoad]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.volume = playerVolume;
  }, [playerVolume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.loop = isRepeatEnabled;
  }, [isRepeatEnabled]);

  function seekAudio(value: number) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(value)) {
      return;
    }

    audio.currentTime = value;
    setPlayerCurrentTime(value);
  }

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !currentAudioUrl) {
      return;
    }

    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }

  function playPrevious() {
    if (activeGenerationIndex <= 0) {
      return;
    }

    setIsDetailPanelOpen(true);
    setActiveGenerationId(filteredGenerations[activeGenerationIndex - 1]?.id ?? null);
  }

  function playNext() {
    if (activeGenerationIndex < 0 || activeGenerationIndex >= filteredGenerations.length - 1) {
      return;
    }

    setIsDetailPanelOpen(true);
    setActiveGenerationId(filteredGenerations[activeGenerationIndex + 1]?.id ?? null);
  }

  function toggleRepeat() {
    setIsRepeatEnabled((current) => !current);
  }

  function changeVolume(value: number) {
    const nextValue = Math.min(1, Math.max(0, value));
    setPlayerVolume(nextValue);
  }

  function playGeneration(generationId: string) {
    if (activeGeneration?.id === generationId && currentAudioUrl) {
      const audio = audioRef.current;
      if (audio) {
        if (audio.paused) {
          void audio.play().catch(() => undefined);
        } else {
          audio.pause();
        }
      }
      return;
    }

    setShouldAutoplayOnLoad(true);
    setActiveGenerationId(generationId);
  }

  function toggleHistoryMenu(generationId: string) {
    setOpenHistoryMenuId((current) => (current === generationId ? null : generationId));
  }

  function onResizeStart(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    dragState.current = {
      startX: event.clientX,
      startWidth: sidebarWidth,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onResizeMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragState.current) {
      return;
    }

    const delta = event.clientX - dragState.current.startX;
    const nextWidth = Math.min(
      SIDEBAR_MAX,
      Math.max(SIDEBAR_MIN, dragState.current.startWidth + delta),
    );
    setSidebarWidth(nextWidth);
  }

  function onResizeEnd() {
    dragState.current = null;
  }

  return (
    <div
      className={`app-shell ${isDetailPanelOpen && activeGeneration ? 'has-detail-panel' : ''}`}
      style={{ ['--sidebar-width' as '--sidebar-width']: `${sidebarWidth}px` } as CSSProperties}
    >
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div>
            <div className="brand-name">Ace Step Studio</div>
            <div className="brand-subtitle">Suno-style music creation workspace</div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-label">Model</div>
            <div className="preset-row preset-row-compact">
              {(Object.keys(presetLibrary) as Array<keyof typeof presetLibrary>).map((presetId) => {
                const preset = presetLibrary[presetId];
                const isActive = form.model_preset_id === presetId;
                return (
                  <button
                    key={presetId}
                    type="button"
                    className={`preset-card ${isActive ? 'is-active' : ''}`}
                    onClick={() => applyPreset(presetId)}
                    title={preset.description}
                    aria-label={`${preset.name}. ${preset.description}`}
                  >
                    <strong>{preset.name}</strong>
                  </button>
                );
              })}
            </div>

          <div className="panel-stack">
            <div className="block-field">
              <div className="field-header">
                <span>Main Genre</span>
              </div>
              <div className="genre-chip-row">
                {genreCategories.map((genre) => (
                  <button
                    key={genre}
                    type="button"
                    className={`genre-chip ${form.genre_category === genre ? 'is-active' : ''}`}
                    onClick={() => setForm((current) => ({ ...current, genre_category: current.genre_category === genre ? '' : genre }))}
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </div>

            <div className="block-field">
              <div className="field-header">
                <span>Caption / Tags</span>
                <button
                  className={`secondary-button field-action dice-action ${captionLoading ? 'is-loading' : ''}`}
                  type="button"
                  onClick={onGenerateCaption}
                  disabled={captionLoading}
                  title="Generate Caption"
                  aria-label="Generate Caption"
                >
                  {captionLoading ? <span className="button-spinner" aria-hidden="true" /> : <DiceIcon />}
                </button>
              </div>
              <textarea
                className="textarea textarea-small"
                value={form.prompt}
                onChange={(event) => setForm((current) => ({ ...current, prompt: event.target.value }))}
                rows={7}
                onFocus={() => setIsCaptionFocused(true)}
                onBlur={() => setIsCaptionFocused(false)}
                placeholder="Describe the song in one strong idea. This value is sent to ComfyUI as tags."
                />
            </div>

            {isCaptionFocused ? (
              <div className="sound-cloud sound-cloud-inline">
                <div className="sound-cloud-label">Suggested tags</div>
                <div className="sound-cloud-tags">
                  {soundPalette.map((sound) => {
                    const isActive = splitTags(form.prompt).includes(sound);
                    return (
                      <button
                        key={sound}
                        type="button"
                        className={`sound-chip ${isActive ? 'is-active' : ''}`}
                        onClick={() => toggleSoundTag(sound)}
                        aria-pressed={isActive}
                      >
                        {sound}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="block-field">
              <div className="field-header">
                <span>Metadata</span>
                <button
                  className={`secondary-button field-action dice-action ${metadataLoading ? 'is-loading' : ''}`}
                  type="button"
                  onClick={onGenerateMetadata}
                  disabled={metadataLoading}
                  title="Suggest Metadata"
                  aria-label="Suggest Metadata"
                >
                  {metadataLoading ? <span className="button-spinner" aria-hidden="true" /> : <DiceIcon />}
                </button>
              </div>
              <div className="advanced-section">
                <div className="field-grid">
                  <label>
                    <span>BPM</span>
                    <input
                      className="input"
                      type="number"
                      value={form.bpm}
                      onChange={(event) => setForm((current) => ({ ...current, bpm: Number(event.target.value) }))}
                    />
                  </label>

                  <label>
                    <span>Duration</span>
                    <input
                      className="input"
                      type="number"
                      value={form.duration}
                      onChange={(event) => setForm((current) => ({ ...current, duration: Number(event.target.value) }))}
                    />
                  </label>

                  <label>
                    <span>Key</span>
                    <div className="key-select" ref={keyMenuRef}>
                      <button
                        type="button"
                        className="input key-select-trigger"
                        onClick={() => setIsKeyMenuOpen((current) => !current)}
                        aria-haspopup="listbox"
                        aria-expanded={isKeyMenuOpen}
                      >
                        <span>{keyOptions.includes(form.keyscale as (typeof keyOptions)[number]) ? form.keyscale : 'E minor'}</span>
                        <span className="key-select-caret" aria-hidden="true">
                          ▾
                        </span>
                      </button>
                      {isKeyMenuOpen ? (
                        <div className="key-select-menu" role="listbox" aria-label="Key">
                          {keyOptions.map((option) => {
                            const isSelected = option === form.keyscale;
                            return (
                              <button
                                key={option}
                                type="button"
                                className={`key-select-option ${isSelected ? 'is-selected' : ''}`}
                                onClick={() => {
                                  setForm((current) => ({ ...current, keyscale: option }));
                                  setIsKeyMenuOpen(false);
                                }}
                                role="option"
                                aria-selected={isSelected}
                              >
                                {option}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </label>

                  <label>
                    <span>Language</span>
                    <div className="language-select" ref={languageMenuRef}>
                      <button
                        type="button"
                        className="input language-select-trigger"
                        onClick={() => setIsLanguageMenuOpen((current) => !current)}
                        aria-haspopup="listbox"
                        aria-expanded={isLanguageMenuOpen}
                      >
                        <span>{languageOptions.find((option) => option.value === form.language)?.label ?? 'EN'}</span>
                        <span className="language-select-caret" aria-hidden="true">
                          ▾
                        </span>
                      </button>
                      {isLanguageMenuOpen ? (
                        <div className="language-select-menu" role="listbox" aria-label="Language">
                          {languageOptions.map((option) => {
                            const isSelected = option.value === form.language;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                className={`language-select-option ${isSelected ? 'is-selected' : ''}`}
                                onClick={() => {
                                  setForm((current) => ({ ...current, language: option.value }));
                                  setIsLanguageMenuOpen(false);
                                }}
                                role="option"
                                aria-selected={isSelected}
                              >
                                <span className="language-select-code">{option.label}</span>
                                <span className="language-select-name">{option.fullLabel}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </label>

                  <label>
                    <span>Seed</span>
                    <input
                      className="input"
                      type="number"
                      value={form.seed}
                      onChange={(event) => setForm((current) => ({ ...current, seed: Number(event.target.value) }))}
                    />
                  </label>

                <label>
                  <span>Time Signature</span>
                  <div className="language-select" ref={timeSignatureMenuRef}>
                    <button
                      type="button"
                      className="input language-select-trigger"
                      onClick={() => setIsTimeSignatureMenuOpen((current) => !current)}
                      aria-haspopup="listbox"
                      aria-expanded={isTimeSignatureMenuOpen}
                    >
                      <span>{form.timesignature}</span>
                      <span className="language-select-caret" aria-hidden="true">
                        ▾
                      </span>
                    </button>
                    {isTimeSignatureMenuOpen ? (
                      <div className="language-select-menu" role="listbox" aria-label="Time Signature">
                        {['2', '3', '4', '6'].map((option) => {
                          const isSelected = form.timesignature === option;
                          return (
                            <button
                              key={option}
                              type="button"
                              className={`language-select-option ${isSelected ? 'is-selected' : ''}`}
                              onClick={() => {
                                setForm((current) => ({ ...current, timesignature: option }));
                                setIsTimeSignatureMenuOpen(false);
                              }}
                              role="option"
                              aria-selected={isSelected}
                            >
                              <span className="language-select-code">{option}</span>
                              <span className="language-select-name">meter</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </label>

                  <label>
                    <span>Temperature</span>
                    <input
                      className="input"
                      type="number"
                      step="0.01"
                      value={form.temperature}
                      onChange={(event) => setForm((current) => ({ ...current, temperature: Number(event.target.value) }))}
                    />
                  </label>

                  <label>
                    <span>CFG Scale</span>
                    <input
                      className="input"
                      type="number"
                      step="0.1"
                      value={form.cfg_scale}
                      onChange={(event) => setForm((current) => ({ ...current, cfg_scale: Number(event.target.value) }))}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="block-field">
              <div className="field-header">
                <span>Lyrics</span>
                <button
                  className={`secondary-button field-action dice-action ${lyricsLoading ? 'is-loading' : ''}`}
                  type="button"
                  onClick={onGenerateLyrics}
                  disabled={lyricsLoading}
                  title="Suggest Lyrics"
                  aria-label="Suggest Lyrics"
                >
                  {lyricsLoading ? <span className="button-spinner" aria-hidden="true" /> : <DiceIcon />}
                </button>
              </div>
              <textarea
                className="textarea textarea-small"
                value={form.lyrics}
                onChange={(event) => setForm((current) => ({ ...current, lyrics: event.target.value }))}
                rows={8}
                placeholder="Write sections like [Verse], [Chorus], or leave blank for instrumental. Uses caption/tags plus metadata."
              />
            </div>

            <div className="block-field">
              <div className="field-header">
                <span>Title *</span>
                <button
                  className={`secondary-button field-action dice-action ${titleLoading ? 'is-loading' : ''}`}
                  type="button"
                  onClick={onGenerateTitle}
                  disabled={titleLoading}
                  title="Suggest Title"
                  aria-label="Suggest Title"
                >
                  {titleLoading ? <span className="button-spinner" aria-hidden="true" /> : <DiceIcon />}
                </button>
              </div>
              <input
                className="input"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Song title"
              />
            </div>
          </div>

          <div className="button-row">
            <button className="primary-button" type="button" onClick={onGenerate} disabled={loading || randomizeLoading || !form.title.trim()}>
              {loading ? 'Generating...' : 'Generate'}
            </button>
            <button
              className="secondary-button randomize-button"
              type="button"
              onClick={onRandomizeAll}
              disabled={randomizeLoading || loading}
              title="Randomize all fields"
              aria-label="Randomize all fields"
            >
              {randomizeLoading ? <span className="button-spinner" aria-hidden="true" /> : <DiceIcon />}
              <span>{randomizeLoading ? 'Randomizing...' : 'Randomize'}</span>
            </button>
          </div>
        </div>
      </aside>

      <div
        className="resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        tabIndex={0}
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
        onLostPointerCapture={onResizeEnd}
      />

      <main className={`content ${isDetailPanelOpen && activeGeneration ? 'has-detail-panel' : ''}`}>
        <section className="workspace-header">
          <div>
            <div className="eyebrow">LOCAL STUDIO</div>
            <h1>Ace Step Studio</h1>
          </div>
          <div className="workspace-stats">
            <div className="stat-card compact">
              <span>Selected Model</span>
              <strong>{selectedModel?.name ?? 'No model'}</strong>
            </div>
            <div className="stat-card compact">
              <span>Done</span>
              <strong>{generationCounts.completed}</strong>
            </div>
          </div>
        </section>

        {error ? <div className="error-banner">{error}</div> : null}

        <section className="library-shell">
          <div className="panel library-panel">
            <div className="panel-header">
              <h2>Library</h2>
              <span>{selectedGenerationIds.length > 0 ? `${selectedGenerationIds.length} selected` : `${filteredGenerations.length} songs`}</span>
            </div>

            <div className="library-toolbar">
              <input
                className="library-search"
                value={librarySearch}
                onChange={(event) => setLibrarySearch(event.target.value)}
                placeholder="Search songs"
              />
              <div className="library-chips">
                {(['all', 'queued', 'running', 'completed', 'failed'] as LibraryStatusFilter[]).map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`library-chip ${libraryStatusFilter === status ? 'is-active' : ''}`}
                    onClick={() => setLibraryStatusFilter(status)}
                  >
                    {status}
                  </button>
                ))}
              </div>
              <div className="library-sort-wrap" ref={librarySortMenuRef}>
                <button
                  type="button"
                  className="library-sort-trigger"
                  onClick={() => setIsLibrarySortMenuOpen((current) => !current)}
                  aria-haspopup="listbox"
                  aria-expanded={isLibrarySortMenuOpen}
                >
                  <span>{librarySortMode === 'newest' ? 'Newest' : 'Oldest'}</span>
                  <span className="library-sort-caret" aria-hidden="true">
                    ▾
                  </span>
                </button>
                {isLibrarySortMenuOpen ? (
                  <div className="library-sort-menu" role="listbox" aria-label="Sort songs">
                    {[
                      { value: 'newest' as const, label: 'Newest' },
                      { value: 'oldest' as const, label: 'Oldest' },
                    ].map((option) => {
                      const isSelected = librarySortMode === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`library-sort-option ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => {
                            setLibrarySortMode(option.value);
                            setIsLibrarySortMenuOpen(false);
                          }}
                          role="option"
                          aria-selected={isSelected}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <div className="library-bulk-actions">
                <label className="library-select-all">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
                  <span>Select all</span>
                </label>
                <button
                  type="button"
                  className="secondary-button library-delete-selected"
                  onClick={onDeleteSelected}
                  disabled={selectedGenerationIds.length === 0}
                >
                  Delete selected
                </button>
              </div>
            </div>

            <div className="history-list">
              {filteredGenerations.map((generation) => (
                <div
                  key={generation.id}
                  className={`history-item ${generation.id === activeGeneration?.id ? 'is-active' : ''}`}
                >
                  <label className="history-select">
                    <input
                      type="checkbox"
                      checked={selectedGenerationIds.includes(generation.id)}
                      onChange={() => toggleGenerationSelection(generation.id)}
                      aria-label={`Select ${generation.title ?? generation.prompt}`}
                    />
                  </label>
                  <button
                    type="button"
                    className="history-item-main"
                    onClick={() => {
                      setActiveGenerationId(generation.id);
                      setIsDetailPanelOpen(true);
                    }}
                  >
                  <div className="history-left">
                    <div className="library-thumb-wrap">
                      {renderArtwork(generation, 'library-thumb')}
                      <div className="library-thumb-duration">{formatAudioTime(generation.duration ?? 0)}</div>
                      {generation.output_audio_url ? (
                        <button
                          className="library-thumb-play"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            playGeneration(generation.id);
                          }}
                          aria-label={activeGeneration?.id === generation.id && isPlaying ? 'Pause track' : 'Play track'}
                          title={activeGeneration?.id === generation.id && isPlaying ? 'Pause' : 'Play'}
                        >
                          {activeGeneration?.id === generation.id && isPlaying ? <PauseIcon /> : <PlayIcon />}
                        </button>
                      ) : null}
                    </div>
                    <div className="history-copy">
                      <strong>{generation.title ?? generation.prompt}</strong>
                <span className="history-description">
                        {generation.tags || generation.model_preset_id}
                      </span>
                      <span>
                        {generation.model_preset_id} · {generation.duration ?? '-'} sec · {generation.bpm ?? '-'} BPM
                      </span>
                    </div>
                  </div>
                  <div className="history-right">
                    <span className={`mini-badge status-${generation.status}`}>{generation.status}</span>
                    <time>{formatTime(generation.created_at)}</time>
                    <div className="history-menu-wrap">
                      <button
                        className="secondary-button history-menu-trigger"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleHistoryMenu(generation.id);
                        }}
                        aria-label="More actions"
                        title="More actions"
                        aria-expanded={openHistoryMenuId === generation.id}
                      >
                        <MoreIcon />
                      </button>
                      {openHistoryMenuId === generation.id ? (
                        <div className="history-menu">
                          <button
                            type="button"
                            className="history-menu-item"
                            onClick={(event) => {
                              event.stopPropagation();
                              void onGenerateCover(generation.id);
                            }}
                            disabled={coverRequestLoading || generation.cover_status === 'running' || generation.status !== 'completed'}
                          >
                            <CoverIcon />
                            <span>Generate Cover</span>
                          </button>
                          {generation.output_audio_url ? (
                            <a
                              className="history-menu-item history-menu-link"
                              href={generation.output_audio_url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => setOpenHistoryMenuId(null)}
                            >
                              <OpenIcon />
                              <span>Open Audio</span>
                            </a>
                          ) : null}
                          {generation.output_audio_url ? (
                            <a
                              className="history-menu-item history-menu-link"
                              href={getDownloadUrl(generation.id)}
                              download
                              onClick={() => setOpenHistoryMenuId(null)}
                            >
                              <OpenIcon />
                              <span>Download</span>
                            </a>
                          ) : null}
                          <button
                            type="button"
                            className="history-menu-item is-danger"
                            onClick={(event) => {
                              event.stopPropagation();
                              void onDelete(generation.id);
                            }}
                          >
                            <DeleteIcon />
                            <span>Delete</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  </button>
                </div>
              ))}
              {filteredGenerations.length === 0 ? <div className="empty-state">No songs match your filters.</div> : null}
            </div>
          </div>
        </section>

        <aside
          className={`detail-panel-shell ${isDetailPanelOpen && activeGeneration ? 'is-open' : ''}`}
          style={{ ['--detail-panel-width' as '--detail-panel-width']: `${DETAIL_PANEL_WIDTH}px` } as CSSProperties}
        >
          {activeGeneration ? (
            <div className="detail-panel">
              <div className="detail-panel-top">
                <div>
                  <div className="detail-eyebrow">Song details</div>
                  <h3>{activeGeneration.title ?? activeGeneration.prompt}</h3>
                </div>
                <button className="detail-close" type="button" onClick={() => setIsDetailPanelOpen(false)} aria-label="Close details">
                  ×
                </button>
              </div>

              {activeGeneration.cover_image_url ? (
                <button
                  className="detail-art-button"
                  type="button"
                  onClick={() => openLightbox(activeGeneration.cover_image_url!, activeGeneration.title ?? activeGeneration.prompt)}
                  aria-label="Open cover image"
                  title="Open cover image"
                >
                  {renderArtwork(activeGeneration, 'detail-art')}
                </button>
              ) : (
                renderArtwork(activeGeneration, 'detail-art')
              )}

              <div className="detail-meta-row">
                <span>{activeGeneration.model_preset_id}</span>
                <span>{activeGeneration.bpm ?? '-'} BPM</span>
                <span>{activeGeneration.duration ?? '-'} sec</span>
                <span>{activeGeneration.language ?? '-'}</span>
              </div>

              <div className="detail-actions">
                <button
                  className="secondary-button detail-action detail-icon-button"
                  type="button"
                  onClick={() => onGenerateCover(activeGeneration.id)}
                  aria-label="Generate cover"
                  title="Generate cover"
                  disabled={coverRequestLoading || activeGeneration.cover_status === 'running' || activeGeneration.status !== 'completed'}
                >
                  {coverRequestLoading || activeGeneration.cover_status === 'running' ? (
                    <span className="button-spinner" aria-hidden="true" />
                  ) : (
                    <CoverIcon />
                  )}
                </button>
                {getAudioUrl(activeGeneration) ? (
                  <a
                    className="secondary-button link-button detail-action detail-icon-button"
                    href={getAudioUrl(activeGeneration) ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open audio"
                    title="Open audio"
                  >
                    <OpenIcon />
                  </a>
                ) : null}
                <button
                  className="secondary-button detail-action detail-icon-button"
                  type="button"
                  onClick={() => onRetry(activeGeneration.id)}
                  aria-label="Retry generation"
                  title="Retry generation"
                >
                  <RetryIcon />
                </button>
                <button
                  className="secondary-button detail-action detail-icon-button danger-action"
                  type="button"
                  onClick={() => onDelete(activeGeneration.id)}
                  aria-label="Delete generation"
                  title="Delete generation"
                >
                  <DeleteIcon />
                </button>
              </div>

              <div className="detail-block">
                <div className="detail-block-title">Tags</div>
                <div className="detail-text">{activeGeneration.tags || 'No tags'}</div>
              </div>

              {activeGeneration.cover_prompt ? (
                <div className="detail-block">
                  <div className="detail-block-title">Cover concept</div>
                  <div className="detail-text">{activeGeneration.cover_prompt}</div>
                </div>
              ) : null}

              <div className="detail-block">
                <div className="detail-block-title">Lyrics</div>
                <div className="detail-lyrics">{activeGeneration.lyrics?.trim() || 'No lyrics provided.'}</div>
              </div>

              {activeGeneration.cover_error_message ? (
                <div className="detail-block">
                  <div className="detail-block-title">Cover error</div>
                  <div className="detail-text error-text">{activeGeneration.cover_error_message}</div>
                </div>
              ) : null}

              {activeGeneration.error_message ? (
                <div className="detail-block">
                  <div className="detail-block-title">Error</div>
                  <div className="detail-text error-text">{activeGeneration.error_message}</div>
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>

        <footer className="player-bar">
          <audio
            ref={audioRef}
            src={currentAudioUrl ?? undefined}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            preload="metadata"
          />

          <div className="player-main">
            {renderArtwork(activeGeneration, 'player-art')}
            <div className="player-copy">
              <strong>{currentTitle}</strong>
              <span>{currentMeta}</span>
            </div>
          </div>

            <div className="player-center">
              <div className="player-controls">
                <button
                  className={`secondary-button player-button player-icon-button ${isRepeatEnabled ? 'is-active' : ''}`}
                  type="button"
                  onClick={toggleRepeat}
                  aria-label={isRepeatEnabled ? 'Repeat on' : 'Repeat off'}
                  title={isRepeatEnabled ? 'Repeat on' : 'Repeat off'}
                >
                  <RepeatIcon />
                </button>
                <button
                  className="secondary-button player-button player-icon-button"
                  type="button"
                  onClick={playPrevious}
                  disabled={activeGenerationIndex <= 0}
                  aria-label="Previous track"
                  title="Previous"
                >
                  <PrevIcon />
                </button>
                <button
                  className="secondary-button player-button player-button-primary player-icon-button player-play-button"
                  type="button"
                  onClick={togglePlayback}
                  disabled={!currentAudioUrl}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <PauseIcon /> : <PlayIcon />}
                </button>
                <button
                  className="secondary-button player-button player-icon-button"
                  type="button"
                  onClick={playNext}
                  disabled={activeGenerationIndex < 0 || activeGenerationIndex >= filteredGenerations.length - 1}
                  aria-label="Next track"
                  title="Next"
                >
                  <NextIcon />
                </button>
              </div>

            <div className="player-scrubber">
              <span>{formatAudioTime(playerCurrentTime)}</span>
              <input
                className="player-range"
                type="range"
                min={0}
                max={Math.max(playerDuration, 1)}
                step="0.1"
                value={Math.min(playerCurrentTime, Math.max(playerDuration, 1))}
                onChange={(event) => seekAudio(Number(event.target.value))}
                disabled={!currentAudioUrl || playerDuration <= 0}
              />
              <span>{formatAudioTime(playerDuration)}</span>
            </div>
          </div>

          <div className="player-actions">
            <div className="player-volume">
              <VolumeIcon />
              <input
                className="player-volume-range"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={playerVolume}
                onChange={(event) => changeVolume(Number(event.target.value))}
                aria-label="Volume"
                title="Volume"
              />
            </div>
            {currentAudioUrl ? (
              <a
                className="secondary-button player-button player-icon-button player-open-button"
                href={currentAudioUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Open audio"
                title="Open audio"
              >
                <OpenIcon />
              </a>
            ) : null}
          </div>
        </footer>
        {lightboxImageUrl ? (
          <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="Expanded cover image" onClick={() => {
            setLightboxImageUrl(null);
            setLightboxTitle('');
          }}>
            <div className="image-lightbox-content" onClick={(event) => event.stopPropagation()}>
              <button
                className="image-lightbox-close"
                type="button"
                onClick={() => {
                  setLightboxImageUrl(null);
                  setLightboxTitle('');
                }}
                aria-label="Close image"
              >
                ×
              </button>
              <img className="image-lightbox-image" src={lightboxImageUrl} alt={lightboxTitle || 'Expanded cover image'} />
              {lightboxTitle ? <div className="image-lightbox-title">{lightboxTitle}</div> : null}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
