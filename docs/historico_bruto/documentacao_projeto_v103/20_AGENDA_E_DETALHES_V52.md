# Sofia OS v52 — Agenda Profissional e detalhes humanos

## 1. Três conceitos diferentes

**Tarefa** é algo que precisa ser feito.

**Lembrete** é um aviso a ser disparado em uma data/hora. Pode existir sem representar uma tarefa.

**Compromisso** é um evento/atividade com data, horário e possivelmente local.

O motor de intenção deve manter esses três tipos separados. Em frases ambíguas, a Sofia pode oferecer botões distintos: **Adicionar aos compromissos**, **Criar tarefa**, **Criar lembrete** e **Só estou contando**. Nada deve ser criado antes da confirmação quando a ação não estiver explícita.

## 2. Agenda

A antiga “Mini agenda” passa a se chamar **Agenda**. A Agenda da Sofia reúne compromissos e lembretes organizados temporalmente.

A v52 prepara campos técnicos para sincronização futura com Google Calendar (`calendar_id` e `sync_state`), mas não anuncia sincronismo como ativo. OAuth, leitura/escrita no Calendar e resolução de conflitos ficam para a etapa de integração externa.

## 3. Interface de usuário versus desenvolvedor

A interface normal mostra apenas o que ajuda a pessoa a entender e agir: título, data/hora legível, local, descrição e **Editar**.

IDs internos, número de revisão, arquivar, relacionar, vínculos, anexar original e exportar `.ics` são ferramentas técnicas e ficam exclusivamente no modo Desenvolvedor.

## 4. Datas e horários

O banco preserva timestamps padronizados, mas a interface nunca deve expor ISO bruto como `2026-09-19T22:00:00.000Z` ao usuário. A apresentação usa data e hora locais em português do Brasil.

## 5. Falhas de conexão com a OpenAI

A v52 usa um transporte HTTPS próprio, com keep-alive e seleção de família de rede, para reduzir falhas transitórias observadas no runtime Node. Quando a chamada falha por conexão/timeout, a mensagem é preservada e a interface oferece **Tentar novamente**.

Uma falha de transporte não deve ser apresentada automaticamente como chave inválida.
