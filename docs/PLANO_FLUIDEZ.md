# Plano Fluidez — o toque sempre vence

Decisão de arquitetura do Sofia OS (10/10/2026). Substitui as tentativas
pontuais das Rodadas 4 a 6 sobre lag nos primeiros toques.

## Por que trava (com prova no código)

O app tem **uma única linha de processamento JavaScript**. Ela atende os toques
e também faz todo o resto. Logo depois da abertura, quatro coisas disputam essa
linha com o dedo do Pedro:

1. **Telas escondidas trabalhando.** As abas pré-carregadas buscam dados na rede
   ao montar e redesenham quando a resposta chega, mesmo sem ninguém olhando
   (`Workspace.tsx` ~93 e ~121, `Pages.tsx` ~78-83, `Agenda.tsx` ~20).
2. **Listas desenhadas inteiras.** Páginas não tem lista virtualizada (12 `.map`
   em `ScrollView`, 0 `FlatList`); Apps tem 42 `.map`, 0 `FlatList`. Montar a aba
   custa proporcional a **todos** os itens. Piora a cada página criada.
3. **Histórico num bloco só.** `startup-snapshot.ts` (`importRaw`) faz um único
   `JSON.parse` do arquivo inteiro de histórico. Piora a cada mês de uso.
4. **O CI testa com um usuário minúsculo.** A semente do smoke cria cerca de 75
   registros. O emulador nunca viu o volume real do Pedro, por isso passa sempre
   enquanto o celular trava.

O teste do Pedro confirmou: esperando ~5 s depois de abrir, tudo fica normal. O
problema é a disputa nessa janela, não o caminho do toque.

## A estratégia: quatro camadas, cada uma resolve uma causa

| Camada | O quê | Resolve | Rodada |
|---|---|---|---|
| 1. Agendador | `idle-work.ts`: todo trabalho não urgente pós-abertura entra numa fila que **só anda quando o usuário não está tocando** (800 ms de silêncio), uma tarefa por vez, com folga. | Disputa nos primeiros segundos (causas 1 e 3 no curto prazo) | 7 |
| 2. `<Activity>` | Cada aba dentro do `<Activity>` do React 19.2 (já presente no RN 0.86 do projeto). Aba escondida: estado preservado, **efeitos desligados** (sem rede, sem timers), atualizações adiadas para quando o React estiver ocioso. | Causa 1, de forma nativa do React, sem auditar efeito por efeito para "não buscar escondido" | 7 |
| 3. Escala | Listas grandes virtualizadas (só desenha o que aparece na tela) e histórico dividido em um fragmento cifrado por rota, carregado aos poucos. | Causas 2 e 3 de forma permanente: o app não fica mais lento com o uso | 8 |
| 4. Orçamento no CI | Usuário de teste **pesado** (pelo menos 3× o volume real do Pedro) e limite reprovador: nenhum bloqueio > 100 ms nos 5 s após abrir com toques roteirizados. | Causa 4: trava vira teste que reprova, para sempre | 7 (medindo) e 9 (reprovando) |

**Margem:** o limite é medido com 3× os dados do Pedro, no emulador do CI (que
roda em software e é mais lento que um celular real). Passar ali significa folga
grande no aparelho.

## Regras permanentes (valem para toda funcionalidade nova)

1. Trabalho que não é necessário para desenhar a tela atual **não roda fora do
   `idleWork`** depois da abertura. Isso inclui o futuro monitoramento de preços
   (coleta em WebView).
2. Toda aba vive dentro de `<Activity>`. Efeitos de aba precisam aguentar
   "limpar ao esconder, rodar de novo ao mostrar".
3. Lista que pode crescer com o uso é virtualizada.
4. Nada de `JSON.parse` de bloco que cresce sem limite na thread JS.
5. Mudança que piora o orçamento de desempenho não entra, igual a teste quebrado.
