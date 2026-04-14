import { useEffect, useMemo, useState } from 'react';
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
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [activeGenerationId, setActiveGenerationId] = useState<string | null>(null);

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

  const activeGeneration = useMemo(
    () => generations.find((generation) => generation.id === activeGenerationId) ?? generations[0] ?? null,
    [activeGenerationId, generations],
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

  async function onRetry(id: string) {
    setError(null);

    try {
      await retryGeneration(id);
      await refreshGenerations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Retry failed');
    }
  }

  const selectedModel = models.find((model) => model.id === form.model_preset_id) ?? models[0] ?? null;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div>
            <div className="brand-name">Ace Step Studio</div>
            <div className="brand-subtitle">Suno-style music creation workspace</div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-label">Prompt</div>
          <textarea
            className="textarea"
            value={form.prompt}
            onChange={(event) => setForm((current) => ({ ...current, prompt: event.target.value }))}
            rows={8}
            placeholder="Describe the song you want to create"
          />

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

          <label className="block-field">
            <span>Lyrics</span>
            <textarea
              className="textarea textarea-small"
              value={form.lyrics}
              onChange={(event) => setForm((current) => ({ ...current, lyrics: event.target.value }))}
              rows={10}
              placeholder="Optional lyrics or structure"
            />
          </label>

          <label className="block-field">
            <span>Tags</span>
            <textarea
              className="textarea textarea-small"
              value={form.tags}
              onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
              rows={4}
              placeholder="Describe mood, arrangement, and sound"
            />
          </label>

          <div className="button-row">
            <button className="secondary-button" type="button" onClick={onAssist} disabled={assistLoading}>
              {assistLoading ? 'Assisting...' : 'Assist Prompt'}
            </button>
            <button className="primary-button" type="button" onClick={onGenerate} disabled={loading}>
              {loading ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </div>
      </aside>

      <main className="content">
        <section className="hero">
          <div>
            <div className="eyebrow">LOCAL STUDIO</div>
            <h1>Generate songs with Ace Step, ComfyUI, and Ollama.</h1>
            <p>
              Minimal, dark, and focused on the workflow that matters: prompt in, music out, history saved locally.
            </p>
          </div>

          <div className="hero-cards">
            <div className="stat-card">
              <span>Selected Model</span>
              <strong>{selectedModel?.name ?? 'No model'}</strong>
              <small>{selectedModel?.description ?? 'Model preset loaded from workflow registry'}</small>
            </div>
            <div className="stat-card">
              <span>Latest Status</span>
              <strong>{activeGeneration?.status ?? 'idle'}</strong>
              <small>{activeGeneration ? formatTime(activeGeneration.created_at) : 'No generation yet'}</small>
            </div>
          </div>
        </section>

        {error ? <div className="error-banner">{error}</div> : null}

        <section className="split-grid">
          <div className="panel">
            <div className="panel-header">
              <h2>Current Generation</h2>
              <span>{activeGeneration?.id ?? 'No job selected'}</span>
            </div>

            {activeGeneration ? (
              <div className="generation-card">
                <div className="generation-title">{activeGeneration.prompt}</div>
                <div className="generation-meta">
                  <span>{activeGeneration.model_preset_id}</span>
                  <span>{activeGeneration.bpm ?? '-'} BPM</span>
                  <span>{activeGeneration.duration ?? '-'} sec</span>
                  <span>{activeGeneration.language ?? '-'}</span>
                </div>
                <div className={`status-pill status-${activeGeneration.status}`}>{activeGeneration.status}</div>
                {activeGeneration.output_audio_path ? (
                  <audio controls src={activeGeneration.output_audio_path} className="audio-player" />
                ) : null}
                {activeGeneration.error_message ? <p className="error-text">{activeGeneration.error_message}</p> : null}
              </div>
            ) : (
              <div className="empty-state">No generation selected yet.</div>
            )}
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>History</h2>
              <span>{generations.length} jobs</span>
            </div>

            <div className="history-list">
              {generations.map((generation) => (
                <button
                  key={generation.id}
                  type="button"
                  className={`history-item ${generation.id === activeGeneration?.id ? 'is-active' : ''}`}
                  onClick={() => setActiveGenerationId(generation.id)}
                >
                  <div>
                    <strong>{generation.prompt}</strong>
                    <span>
                      {generation.model_preset_id} · {generation.status}
                    </span>
                  </div>
                  <time>{formatTime(generation.created_at)}</time>
                </button>
              ))}
            </div>

            {activeGeneration ? (
              <div className="history-actions">
                <button className="secondary-button" type="button" onClick={() => onRetry(activeGeneration.id)}>
                  Retry generation
                </button>
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
