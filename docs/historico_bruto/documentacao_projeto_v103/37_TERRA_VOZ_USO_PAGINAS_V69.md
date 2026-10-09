# v69 - Terra, Voz, Uso e Páginas

## Decisões

- Filtro Compartilhado usa `gpt-5.6-terra` por padrão.
- Tokens/chamadas locais são alertas, nunca bloqueio; alertas pessoais são configuráveis.
- Usage local usa tokens realmente informados pelas respostas da API; Usage organizacional é opcional via Admin API Key.
- Voz é modalidade nativa: áudio permanece áudio e a transcrição alimenta o mesmo pipeline IA-first.
- Safe Chat transcreve sem persistir o áudio normal no banco de voice messages.
- Página explicitamente citada vence contexto visual; estrutura dentro da página usa `append_page_structure`.
- Capa e layout de página seguem hierarquia documental full-width inspirada no Notion.

## Alertas

- padrão: 250.000 tokens/dia UTC;
- cota configurada: 2.500.000 tokens/dia UTC;
- 50/80/90/100% geram avisos, sem bloquear.

## Voz

Endpoints:
- `POST /chat/audio`
- `POST /api/audio/transcribe`
- `GET /api/messages/:id/audio`

Modelo padrão de transcrição: `gpt-transcribe`.
