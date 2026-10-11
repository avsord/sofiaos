# Relatório real do celular do dono — Sofia 0.3.116 (versionCode 121), 2026-10-11

## Confirmado
Gravador de áudio fora da montagem: Conversa 331 -> 161 ms, campo de digitação 224 -> 55 ms. Bloqueios > 250 ms nos 5 s: 6 -> 3. Máximo 736 -> 579 ms.

## O que ainda não fecha
- 1º toque na Conversa: 760 ms (igual), com montagem de 161 ms. Linha do tempo: bloqueio [656->1143] 487 ms com evento só "input" e "module:chat"
  (módulo = 4,8 ms); toque registrado em 1144; montagem 1338->1499; quadro em 1904. Entre o toque e a montagem, 194 ms; entre a montagem e o quadro, 405 ms,
  com bloqueios [1600->1727] sem evento e [1807->1904] parse:history. **A espera não está na montagem.**
- Bloqueio [222->635] de 414 ms antes de qualquer toque, sem evento JS. O mesmo padrão em 0.3.113 ([118->529], 411 ms). Começa ANTES de `hidratar` (310 ms),
  então não é a leitura do histórico.
- Abas já montadas: 100–280 ms por toque; voltar ao Início 212–282 ms.

## Hipóteses eliminadas com dados
- Props instáveis das telas (re-render de todas a cada troca): o código já compara `screenProps` chave a chave e os handlers são `useCallback`. Só as duas telas com `active` mudando re-renderizam.
- Expansão de recorrências da Agenda: 0,6 ms.
- Leitura/parse do histórico como causa do bloqueio de 414 ms: começa antes dela.

## Fatos de código a investigar com a medição por render (0.3.117)
- Conversa ativa: `refresh(true)` a cada 2 s (setInterval) + ao ativar; cada resposta re-renderiza a lista.
- `useVisibleLoad` em Agenda/Apps/Páginas/Conversa: busca de rede 350 ms depois de cada ativação.
- `BackgroundServices` recebe `preloadWhenIdle={screenTab==='home'}`: re-renderiza ao entrar/sair do Início.
- `active` muda em duas telas por toque: custo da re-renderização de cada tela em aparelho Unisoc desconhecido até a 0.3.117 medir.
