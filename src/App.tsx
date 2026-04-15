import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { assistPrompt, createGeneration, deleteGeneration, generatePromptIdea, loadGenerations, loadModels, retryGeneration } from './api';
import type { Generation, ModelPreset } from './types';

const defaultForm = {
  prompt: 'A warm, intimate ambient track with soft vocals and slow evolution.',
  lyrics: '',
  tags: '',
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
const SIDEBAR_MIN = 320;
const SIDEBAR_MAX = 760;
const DEFAULT_SIDEBAR_WIDTH = 380;
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

export default function App() {
  const [models, setModels] = useState<ModelPreset[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(false);
  const [assistLoading, setAssistLoading] = useState(false);
  const [ideaLoading, setIdeaLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [activeGenerationId, setActiveGenerationId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryStatusFilter, setLibraryStatusFilter] = useState<LibraryStatusFilter>('all');
  const [librarySortMode, setLibrarySortMode] = useState<LibrarySortMode>('newest');
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);
  const [playerCurrentTime, setPlayerCurrentTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);
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

  const activeGeneration = useMemo(
    () => generations.find((generation) => generation.id === activeGenerationId) ?? generations[0] ?? null,
    [activeGenerationId, generations],
  );

  const filteredGenerations = useMemo(() => {
    const search = librarySearch.trim().toLowerCase();
    return generations
      .filter((generation) => {
        const matchesStatus = libraryStatusFilter === 'all' || generation.status === libraryStatusFilter;
        const haystack = [generation.prompt, generation.tags, generation.model_preset_id, generation.language]
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

  async function refreshGenerations() {
    const data = await loadGenerations();
    setGenerations(data);
  }

  async function onGenerate() {
    setLoading(true);
    setError(null);

    try {
      await createGeneration({
        ...form,
        seed: form.seed || null,
        lyrics: form.lyrics || null,
        tags: form.tags || null,
      });
      await refreshGenerations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Generation request failed');
    } finally {
      setLoading(false);
    }
  }

  async function onAssist() {
    setAssistLoading(true);
    setError(null);

    try {
      const response = await assistPrompt({
        prompt: form.prompt,
        lyrics: form.lyrics,
        language: form.language,
      });

      setForm((current) => ({
        ...current,
        tags: response.tags,
        lyrics: response.lyrics || current.lyrics,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Prompt assist failed');
    } finally {
      setAssistLoading(false);
    }
  }

  async function onGenerateIdea() {
    setIdeaLoading(true);
    setError(null);

    try {
      const response = await generatePromptIdea({
        prompt: form.prompt,
        lyrics: form.lyrics,
        language: form.language,
        model_preset_id: form.model_preset_id,
      });

      setForm((current) => ({
        ...current,
        prompt: response.prompt || current.prompt,
        tags: response.tags || current.tags,
        lyrics: response.lyrics || current.lyrics,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Idea generation failed');
    } finally {
      setIdeaLoading(false);
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
      prompt: current.prompt.trim() ? current.prompt : preset.prompt,
    }));
  }

  function toggleSoundTag(tag: string) {
    setForm((current) => {
      const tags = splitTags(current.tags);
      const normalizedTag = tag.trim();
      const nextTags = tags.includes(normalizedTag)
        ? tags.filter((existingTag) => existingTag !== normalizedTag)
        : [...tags, normalizedTag];

      return {
        ...current,
        tags: nextTags.join(', '),
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

  const currentAudioUrl = getAudioUrl(activeGeneration);
  const currentTitle = activeGeneration?.prompt ?? 'No song selected';
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
  }, [currentAudioUrl]);

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

          <div className="sidebar-actions">
            <button className={`secondary-button action-button ${assistLoading ? 'is-loading' : ''}`} type="button" onClick={onAssist} disabled={assistLoading}>
              <span className="action-button-content">
                <span className="action-button-label">{assistLoading ? 'Refining...' : 'Refine Prompt'}</span>
                {assistLoading ? <span className="button-spinner" aria-hidden="true" /> : null}
              </span>
            </button>
            <button
              className={`secondary-button idea-button ${ideaLoading ? 'is-loading' : ''}`}
              type="button"
              onClick={onGenerateIdea}
              disabled={ideaLoading}
              aria-label={ideaLoading ? 'Generating idea' : 'Generate idea'}
              title={ideaLoading ? 'Generating idea' : 'Generate idea'}
            >
              {ideaLoading ? <span className="button-spinner idea-spinner" aria-hidden="true" /> : null}
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="idea-icon">
                <rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <circle cx="8" cy="8" r="1.3" fill="currentColor" />
                <circle cx="16" cy="8" r="1.3" fill="currentColor" />
                <circle cx="8" cy="16" r="1.3" fill="currentColor" />
                <circle cx="16" cy="16" r="1.3" fill="currentColor" />
                <circle cx="12" cy="12" r="1.3" fill="currentColor" />
              </svg>
            </button>
          </div>

          <div className="panel-stack">
            <label className="block-field">
              <span>Caption</span>
              <textarea
                className="textarea textarea-small"
                value={form.prompt}
                onChange={(event) => setForm((current) => ({ ...current, prompt: event.target.value }))}
                rows={7}
                placeholder="Describe the song in one strong idea"
              />
            </label>

            <label className="block-field">
              <span>Lyrics</span>
              <textarea
                className="textarea textarea-small"
                value={form.lyrics}
                onChange={(event) => setForm((current) => ({ ...current, lyrics: event.target.value }))}
                rows={8}
                placeholder="Write sections like [Verse], [Chorus], or leave blank for instrumental"
              />
            </label>

            <div className="tab-copy subtle">
              <div className="tab-copy-title">Sound direction</div>
              <div className="tab-copy-description">
                Pick a few tags to steer texture, genre, and energy. You can still type your own tags below.
              </div>
            </div>

            <div className="sound-cloud">
              {soundPalette.map((sound) => {
                const isActive = splitTags(form.tags).includes(sound);
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

            <label className="block-field">
              <span>Sound tags</span>
              <textarea
                className="textarea"
                value={form.tags}
                onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
                rows={4}
                placeholder="Mood, texture, voice, instruments, and production style"
              />
            </label>

            <details className="advanced-section" open>
              <summary>Advanced metadata</summary>
              <div className="advanced-summary">
                BPM, duration, key, language, seed, meter, temperature, and CFG scale.
              </div>
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
                  <input
                    className="input"
                    value={form.keyscale}
                    onChange={(event) => setForm((current) => ({ ...current, keyscale: event.target.value }))}
                  />
                </label>

                <label>
                  <span>Language</span>
                  <input
                    className="input"
                    value={form.language}
                    onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))}
                  />
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
                  <input
                    className="input"
                    value={form.timesignature}
                    onChange={(event) => setForm((current) => ({ ...current, timesignature: event.target.value }))}
                  />
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
            </details>
          </div>

          <div className="button-row">
            <button className="primary-button" type="button" onClick={onGenerate} disabled={loading}>
              {loading ? 'Generating...' : 'Generate'}
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
              <span>{activeGeneration ? `Selected: ${activeGeneration.model_preset_id}` : `${filteredGenerations.length} songs`}</span>
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
              <select
                className="library-sort"
                value={librarySortMode}
                onChange={(event) => setLibrarySortMode(event.target.value as LibrarySortMode)}
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
            </div>

            <div className="history-list">
              {filteredGenerations.map((generation) => (
                <button
                  key={generation.id}
                  type="button"
                  className={`history-item ${generation.id === activeGeneration?.id ? 'is-active' : ''}`}
                  onClick={() => {
                    setActiveGenerationId(generation.id);
                    setIsDetailPanelOpen(true);
                  }}
                >
                  <div className="history-left">
                    <div className="library-thumb" />
                    <div className="history-copy">
                      <strong>{generation.prompt}</strong>
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
                  </div>
                </button>
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
                  <h3>{activeGeneration.prompt}</h3>
                </div>
                <button className="detail-close" type="button" onClick={() => setIsDetailPanelOpen(false)} aria-label="Close details">
                  ×
                </button>
              </div>

              <div className="detail-art" />

              <div className="detail-meta-row">
                <span>{activeGeneration.model_preset_id}</span>
                <span>{activeGeneration.bpm ?? '-'} BPM</span>
                <span>{activeGeneration.duration ?? '-'} sec</span>
                <span>{activeGeneration.language ?? '-'}</span>
              </div>

              <div className="detail-actions">
                {getAudioUrl(activeGeneration) ? (
                  <a className="secondary-button link-button detail-action" href={getAudioUrl(activeGeneration) ?? '#'} target="_blank" rel="noreferrer">
                    Open audio
                  </a>
                ) : null}
                <button className="secondary-button detail-action" type="button" onClick={() => onRetry(activeGeneration.id)}>
                  Retry
                </button>
                <button className="secondary-button detail-action danger-action" type="button" onClick={() => onDelete(activeGeneration.id)}>
                  Delete
                </button>
              </div>

              <div className="detail-block">
                <div className="detail-block-title">Tags</div>
                <div className="detail-text">{activeGeneration.tags || 'No tags'}</div>
              </div>

              <div className="detail-block">
                <div className="detail-block-title">Lyrics</div>
                <div className="detail-lyrics">{activeGeneration.lyrics?.trim() || 'No lyrics provided.'}</div>
              </div>

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
            <div className="player-art" />
            <div className="player-copy">
              <strong>{currentTitle}</strong>
              <span>{currentMeta}</span>
            </div>
          </div>

          <div className="player-center">
            <div className="player-controls">
              <button className="secondary-button player-button" type="button" onClick={playPrevious} disabled={activeGenerationIndex <= 0}>
                Prev
              </button>
              <button className="secondary-button player-button player-button-primary" type="button" onClick={togglePlayback} disabled={!currentAudioUrl}>
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <button
                className="secondary-button player-button"
                type="button"
                onClick={playNext}
                disabled={activeGenerationIndex < 0 || activeGenerationIndex >= filteredGenerations.length - 1}
              >
                Next
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
            {currentAudioUrl ? (
              <a className="secondary-button player-button" href={currentAudioUrl} target="_blank" rel="noreferrer">
                Open
              </a>
            ) : null}
          </div>
        </footer>
      </main>
    </div>
  );
}
