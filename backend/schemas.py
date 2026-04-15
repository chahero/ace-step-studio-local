from pydantic import BaseModel, Field


class GenerationCreate(BaseModel):
    title: str
    prompt: str
    lyrics: str | None = None
    tags: str | None = None
    model_preset_id: str
    bpm: int | None = None
    duration: int | None = None
    timesignature: str | None = None
    language: str | None = None
    keyscale: str | None = None
    seed: int | None = None
    temperature: float | None = Field(default=0.85)
    cfg_scale: float | None = Field(default=2.0)


class PromptAssistRequest(BaseModel):
    prompt: str
    lyrics: str | None = None
    language: str | None = None


class PromptIdeaRequest(BaseModel):
    prompt: str | None = None
    lyrics: str | None = None
    language: str | None = None
    model_preset_id: str | None = None


class PromptLyricsRequest(BaseModel):
    prompt: str
    language: str | None = None
    bpm: int | None = None
    duration: int | None = None
    timesignature: str | None = None
    keyscale: str | None = None


class PromptMetadataRequest(BaseModel):
    prompt: str
    lyrics: str | None = None
    language: str | None = None


class PromptTitleRequest(BaseModel):
    prompt: str
    lyrics: str | None = None
    metadata: dict[str, object] | None = None
