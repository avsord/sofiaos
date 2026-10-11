# Relatório real do celular do dono — Sofia 0.3.115 (versionCode 120), 2026-10-11

Capturado 11,3 s depois da abertura. SoC Unisoc. Teste: toques rápidos nas abas.

## O que o relatório DESMENTIU
`agenda:expand` **0,6 ms**, `agenda:priority` 0,2 ms, `home:expand` 1,2 ms, `home:priority` 0,2 ms. A hipótese "a expansão de recorrências causa os
154 ms da Agenda" estava errada (a otimização da 0.3.115 é exata e inofensiva, mas não era o alvo). Das medições novas, só uma é grande:

## O que CONFIRMOU
`composer:recorder` = **148,8 ms**, dentro de `chat:composer` = 224 ms (Conversa total 331 ms; lista 318 ms).
Primeiro toque na Conversa: **741 ms** até o quadro. Causa: `useAudioRecorder` + `useAudioRecorderState(recorder,120)` no `Composer`
criam o gravador nativo ao montar e o consultam de 120 em 120 ms durante toda a vida da aba.

## Ainda sem causa
- Agenda: ~146 ms entre o início da montagem e o começo do `MonthSwipe` (corpo, `ScrollView`, `RefreshControl`, `ScreenTitle`); não é expand nem priority.
- Voltar ao Início: 312 ms. Primeiras visitas: Agenda 378, Páginas 370, Apps 301. Visitas seguintes: Páginas 180–231, Agenda 116–335, Perfil 151–173, Conversa 87.

## Primeiros 5 s
Maior bloqueio 736 ms; 6 acima de 250 ms. Montagens: Conversa 331, Agenda 222 (mês 76), Apps 234, Páginas 184, Perfil 75.
`snapshot:write`: 1 em 11 s.
