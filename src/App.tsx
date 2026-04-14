import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { assistPrompt, createGeneration, loadGenerations, loadModels, retryGeneration } from './api';
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
type PanelTab = 'simple' | 'advanced' | 'sounds';
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
  'neo-soul',
  'trap',
  'warm',
  'vocal',
  'dark',
  'minimal',
  'lo-fi',
  'drift',
];

function formatTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

export default function App() {
  const [models, setModels] = useState<ModelPreset[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(false);
  const [assistLoading, setAssistLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [activeGenerationId, setActiveGenerationId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [activeTab, setActiveTab] = useState<PanelTab>('simple');
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryStatusFilter, setLibraryStatusFilter] = useState<LibraryStatusFilter>('all');
  const [librarySortMode, setLibrarySortMode] = useState<LibrarySortMode>('newest');
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

  async function onRetry(id: string) {
    setError(null);

    try {
      await retryGeneration(id);
      await refreshGenerations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Retry failed');
    }
  }

  function applyPreset(presetId: keyof typeof presetLibrary) {
    const preset = presetLibrary[presetId];
    setForm((current) => ({
      ...current,
      model_preset_id: presetId,
      prompt: preset.prompt,
      bpm: preset.bpm,
      duration: preset.duration,
      timesignature: preset.timesignature,
      language: preset.language,
      keyscale: preset.keyscale,
      seed: preset.seed,
      temperature: preset.temperature,
      cfg_scale: preset.cfg_scale,
      tags: preset.tags,
      lyrics: current.lyrics,
    }));
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

    audio.pause();
    audio.load();
    setIsPlaying(false);
  }, [currentAudioUrl]);

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
      className="app-shell"
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
          <div className="panel-tabs">
            {(['simple', 'advanced', 'sounds'] as PanelTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`panel-tab ${activeTab === tab ? 'is-active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'simple' ? (
            <div className="panel-stack">
              <div className="preset-row">
                {(Object.keys(presetLibrary) as Array<keyof typeof presetLibrary>).map((presetId) => {
                  const preset = presetLibrary[presetId];
                  const isActive = form.model_preset_id === presetId;
                  return (
                    <button
                      key={presetId}
                      type="button"
                      className={`preset-card ${isActive ? 'is-active' : ''}`}
                      onClick={() => applyPreset(presetId)}
                    >
                      <div className="preset-card-top">
                        <strong>{preset.name}</strong>
                        <span>{presetId}</span>
                      </div>
                      <p>{preset.description}</p>
                    </button>
                  );
                })}
              </div>

              <label className="block-field">
                <span>Lyrics</span>
                <textarea
                  className="textarea textarea-small"
                  value={form.lyrics}
                  onChange={(event) => setForm((current) => ({ ...current, lyrics: event.target.value }))}
                  rows={8}
                  placeholder="Write some lyrics or leave blank for instrumental"
                />
              </label>

              <label className="block-field">
                <span>Style</span>
                <textarea
                  className="textarea textarea-small"
                  value={form.tags}
                  onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
                  rows={4}
                  placeholder="Mood, texture, voice, and production style"
                />
              </label>

              <button className="secondary-button" type="button" onClick={onAssist} disabled={assistLoading}>
                {assistLoading ? 'Assisting...' : 'Assist Prompt'}
              </button>
            </div>
          ) : null}

          {activeTab === 'advanced' ? (
            <div className="panel-stack">
              <label className="block-field">
                <span>Prompt</span>
                <textarea
                  className="textarea"
                  value={form.prompt}
                  onChange={(event) => setForm((current) => ({ ...current, prompt: event.target.value }))}
                  rows={7}
                  placeholder="Describe the song you want to create"
                />
              </label>

              <div className="field-grid">
                <label>
                  <span>Model</span>
                  <select
                    className="input"
                    value={form.model_preset_id}
                    onChange={(event) => setForm((current) => ({ ...current, model_preset_id: event.target.value }))}
                  >
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                </label>

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
            </div>
          ) : null}

          {activeTab === 'sounds' ? (
            <div className="panel-stack">
              <div className="sound-cloud">
                {soundPalette.map((sound) => (
                  <button
                    key={sound}
                    type="button"
                    className="sound-chip"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        tags: current.tags ? `${current.tags}, ${sound}` : sound,
                      }))
                    }
                  >
                    {sound}
                  </button>
                ))}
              </div>

              <label className="block-field">
                <span>Prompt</span>
                <textarea
                  className="textarea"
                  value={form.prompt}
                  onChange={(event) => setForm((current) => ({ ...current, prompt: event.target.value }))}
                  rows={7}
                  placeholder="Describe the song you want to create"
                />
              </label>

              <button className="secondary-button" type="button" onClick={onAssist} disabled={assistLoading}>
                {assistLoading ? 'Assisting...' : 'Assist Prompt'}
              </button>
            </div>
          ) : null}

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

      <main className="content">
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
                  onClick={() => setActiveGenerationId(generation.id)}
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

          <div className="player-controls">
            <button className="secondary-button player-button" type="button" onClick={togglePlayback} disabled={!currentAudioUrl}>
              {isPlaying ? 'Pause' : 'Play'}
            </button>
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
