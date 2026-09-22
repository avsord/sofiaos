# Sofia OS v52 — Comece aqui

Data da versão: 19/09/2026.

A v52 mantém a memória persistente, a interface dupla, os filtros profissionais e o motor **IA Primeiro**, e profissionaliza Agenda, lembretes e detalhes do usuário.

## Instalação

1. Pare a Sofia com `Ctrl+C`.
2. Extraia o pacote v52 em uma pasta separada.
3. Execute `ATUALIZAR_SOFIA.cmd` na pasta extraída.
4. Aguarde `ATUALIZACAO CONCLUIDA`.
5. Abra `INICIAR_SOFIA.cmd` na pasta original `C:\Users\pedro\SOFIA-OS`.
6. Abra `http://localhost:3000` e pressione `Ctrl+F5`.

O instalador preserva `.env`, chaves, memória, banco, anexos, backups, exports e `node_modules`. Arquivos gerenciados que estiverem diferentes recebem backup antes da substituição. O iniciador local é preservado quando estiver personalizado.

## Experiência do usuário

A visão normal mostra **Início, Resumo, Tarefas, Compromissos, Listas, Biblioteca, Estudos e Diário Pessoal**. O modo Desenvolvedor concentra Fluxo Ativo, Memória, detalhes de relações, filtros, auditoria e controles técnicos.

**Início** é a Home. **Resumo** rola a própria Home para as informações principais. A área **Agenda** reúne compromissos e lembretes temporais sem expor IDs, timestamps ISO ou ferramentas técnicas.

## IA Primeiro

A conversa segue o fluxo:

**IA interpreta → esclarece com pergunta e botões se necessário → IA estrutura a intenção → backend valida → backend executa.**

O backend não deve tentar adivinhar intenção humana por palavras-chave. Ele valida integridade, permissões, campos e efeitos.

## Tarefa, Lembrete e Compromisso

São entidades diferentes:

- **Tarefa**: algo que precisa ser feito.
- **Lembrete**: aviso em determinado momento.
- **Compromisso**: evento/atividade com data, horário e possivelmente local.

Quando uma mensagem não deixa clara a ação, a Sofia pode apresentar opções separadas, por exemplo **Adicionar aos compromissos**, **Criar tarefa**, **Criar lembrete** e **Só estou contando**.

## Google Calendar

A Agenda local já possui a estrutura necessária para associar registros a um calendário externo. A sincronização real com Google Calendar ainda depende de OAuth, leitura/escrita e política de conflitos e será conectada em uma etapa externa futura, junto das demais integrações. A interface não deve fingir que essa conexão já existe.

## Privacidade e filtros

O **Filtro Compartilhado** corresponde ao projeto autorizado para compartilhamento/benefício de tokens. O **Filtro Privado** corresponde ao projeto fora dessa seleção. As chaves são separadas e validadas antes de salvar.

A seleção de intenção continua sendo feita pela IA; o backend mantém apenas uma barreira mínima contra segredos explícitos antes de qualquer envio.

## Datas e detalhes

Datas e horários são mostrados em português e formato humano. ISO, IDs, número de revisão, `.ics`, relacionamentos, anexos e outros controles de implementação são internos e aparecem somente no modo Desenvolvedor quando úteis.

## Falha de conexão com OpenAI

A v52 usa transporte HTTPS robusto no Node. Em falhas transitórias, a mensagem permanece registrada e a interface oferece **Tentar novamente**. Erro de rede não deve ser tratado automaticamente como chave inválida.

## Validação

A suíte final da v52 contém **222 testes automatizados**, todos aprovados. Consulte `docs/20_AGENDA_E_DETALHES_V52.md` e o relatório em `validacao/RELATORIO_TESTES_V52.md` do pacote de atualização.
