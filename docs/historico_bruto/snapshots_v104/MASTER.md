# MASTER — Sofia OS v104

Este documento é o mapa principal do projeto. Para alterações futuras, começar por aqui em vez de percorrer o histórico de versões.

## Comando oficial para iniciar

```powershell
Set-Location "$HOME\SOFIA-OS"
& "$HOME\SOFIA-OS\INICIAR_SOFIA.cmd"
```

## Mapa rápido

| Área | Arquivo / pasta | Uso |
|---|---|---|
| Estrutura da interface | `public/index.html` | HTML e pontos de montagem |
| Ajustes visuais novos | `public/ui-current.css` | Primeira escolha para mudanças pequenas de UI |
| CSS legado/base | `public/style.css` | Base visual acumulada; mexer somente quando necessário |
| Lógica do navegador | `public/app.js` | Estado, navegação, páginas e interações |
| Servidor | `src/server.js` | Inicialização HTTP |
| Rotas/API | `src/core/http-handler.js`, `src/core/api45.js` | Endpoints e transporte |
| Regras centrais | `src/core/sofia-core.js` | Orquestração principal |
| Memória | `src/memory/` | SQLite, schema e migrações |
| Serviços | `src/services/` | IA, backup, privacidade, agenda, áudio e uso |
| Dados locais | `data/` | Não editar nem substituir em atualizações |
| Testes principais | `tests/` | Regressões essenciais atuais |

## Regra para editar mais rápido

1. Mudança apenas visual: tente primeiro `public/ui-current.css`.
2. Mudança de comportamento no navegador: procure pelo ID/texto da interface em `public/app.js`.
3. Mudança de dados/API: procure a rota em `src/core/http-handler.js` e siga para o serviço correspondente.
4. Não use documentos antigos de versão como fonte principal; o estado atual está neste master.
5. Não alterar `.env`, `data/`, `backups/` ou chaves durante atualizações de código.

## Estado atual de UI

- `Início` e `Resumo` usam a mesma régua visual dos itens de `APPS`.
- O sino abre a prévia de notificações por hover/foco e a central completa por `Ver todas`.
- A página completa de notificações organiza os itens por área e origem.
