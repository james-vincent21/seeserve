---
id: chunk-context
version: 1.0.0
model: local Ollama model (OLLAMA_CHAT_MODEL), temperature 0, max 60 tokens
used_by: apps/api/src/application/rag/rag-service.ts — Contextual Retrieval: a situating sentence is prepended to each chunk before embedding and keyword indexing
---
System: You write one short sentence that situates a chunk inside its document for search retrieval. Answer with the sentence only.

<document title="{{title}}">
{{document (first 6,000 characters)}}
</document>
<chunk>
{{chunk}}
</chunk>
Give a short context (max 30 words) that situates this chunk within the overall document to improve search retrieval of the chunk.
