# Arquitetura e escopo — vigente na v64

Base preservada: Node.js, CommonJS, Express, `src/server.js`, SQLite. A nova versão não instala Next.js ou Supabase, não troca para outro starter e não altera a porta automaticamente.

## Organização

Panorama é uma projeção dos registros. Fluxo Ativo agrega intenções que avançam e acompanhamentos; Memória conserva fatos e fontes; Estudos organiza cursos/aulas; Acervo organiza materiais e experiências; Meditações é um compartimento criptografado; Conexões indica permissões e situação dos adaptadores. Os menus não são agentes com personalidades diferentes.

Memória conserva bruto, notas/resumo organizado, checkpoint e regras. Os resumos existentes são extrativos locais (trechos das falas), não uma consolidação semântica autônoma de toda a vida. Há buscas lexicais normalizadas, labels, links explícitos e versões, não uma rede neural própria ou grafo inferido automaticamente. Histórico e notas da v44 ficam nas tabelas originais; novas fichas usam entities + versões + relações + eventos.

Cada objeto novo tem tipo, título, descrição, área, labels, privacidade, estado, dados tipados, versão, datas e origem. Links entre objetos não os movem de área. Concorrência de edição exige a revisão correta; alteração material de rascunho aprovado invalida a aprovação. Tarefas mantêm a data original e versões de reagendamento.

29 tipos novos: projetos, sonhos, compromissos, rotinas, produtos, itens de mercado/farmácia, monitores, revisões de plano, saídas/check-in, aprovações, automações, notas fiscais, pagamentos, oportunidades, cursos, aulas, receitas, sessões de receita, músicas, filmes, vídeos, leituras, fontes, referências, arquivos, contatos, ideias, anotações e lições. Além deles permanecem tarefas e notas da memória v44.

## Contexto e escrita pelo chat — regra vigente v62+

A arquitetura vigente usa um **ciclo completo de IA**. O fluxo normal é:

**usuário → IA interpreta → IA responde/pergunta → usuário responde → IA reinterpreta → backend valida/executa somente quando o plano estiver pronto → resultado técnico volta para a IA → IA responde ao usuário**.

A IA é a autoridade semântica global: intenção, continuidade, referências, ambiguidades, seleção de capacidade, alvo, sensibilidade, rota e significado de respostas curtas ou botões são decididos pelo motor de IA. O backend não classifica linguagem natural, não cria perguntas conversacionais e não troca uma intenção por outra com regex/palavras-chave.

Quando faltar informação, a própria IA usa `clarify`, formula a pergunta e pode oferecer opções. Texto livre e clique em botão voltam para o **mesmo ciclo de diálogo da IA**. O backend só recebe um plano executável quando `ready_for_backend=true`. Exclusões semanticamente claras não ganham uma segunda confirmação artificial: a IA escolhe o escopo real e o backend executa somente os membros atuais desse escopo.

O backend continua responsável por controles determinísticos: bloquear segredos explícitos antes da IA, autenticação, permissões, schema, IDs, datas/horários já estruturados, integridade, persistência, transações, auditoria e execução. Se ele rejeitar um plano por motivo técnico, **não pergunta diretamente ao usuário**: devolve o diagnóstico para a IA, que decide se pergunta, corrige o plano ou muda de rumo.

Depois da execução, o backend devolve fatos técnicos do que realmente ocorreu. Esses fatos retornam para a IA, e só a IA produz a resposta visível ao usuário. Assim o backend nunca é a voz conversacional da Sofia.

O privado pode recuperar trechos relevantes de notas, histórico autorizado, checkpoints e fichas permitidas, com limites de tamanho e referências. O compartilhado recebe somente contexto autorizado. Registros locais e o cofre não entram na recuperação comum. Contexto privado pode elevar a rota; nunca é rebaixado para compartilhado.

Ferramentas futuras devem entrar no catálogo/schema oferecido à IA e seguir o mesmo ciclo; não devem criar classificadores paralelos no backend. Consulte `30_CICLO_IA_COMPLETO_V62.md`.

## Espaços e páginas — regra vigente v63

Espaços raiz e páginas/subpáginas continuam usando `user_page`, com hierarquia por `parent_id`. O conteúdo interno da página usa blocos persistidos em `blocks_json`. A v63 amplia esse formato com rich text, comentários, mídia, tabela simples, links de página e referências a tarefas/Agenda. Blocos internos não viram entidades independentes por padrão; somente objetos que realmente existem fora da página (subpágina, tarefa, compromisso, lembrete, anexo) mantêm IDs próprios e são vinculados.

O editor sanitiza rich text no cliente e o backend valida novamente tipos, tamanho, comentários, dados e marcação antes de persistir. Anexos continuam locais e entram nos backups. Consulte `31_EDITOR_AVANCADO_V63.md`.

## Operação

O agendador persiste jobs e roda enquanto o processo estiver ligado. Recarrega o estado ao iniciar e não presume que uma atividade foi cumprida quando seu horário passa. Não é serviço 24h e não depende de o modelo estar conversando continuamente. Coletas de feeds e rotinas locais são reais; calendários, envios e bancos reais permanecem sem conexão.

O SQLite de trabalho comum não é criptografado. Anexos pequenos estão no SQLite nesta etapa (10 MB cada, 50 MB no total), para preservar originais e restauração sem introduzir uma falsa integração Drive. O desenho futuro continua prevendo binários no Sofia Storage e metadados no cérebro. IDs dos registros permitem migrar para PostgreSQL/Supabase depois, mas essa migração não foi implementada aqui.

## Segurança de publicação

Host local e proteções do painel devem permanecer ativos. O receptor legado na 3001 e o painel local na 3000 são partes diferentes. Não aponte um túnel público para o painel administrativo completo. Não há login multiusuário, isolamento por cliente, termos publicados, Stripe/loja de apps ou deploy permanente neste pacote.


## Agenda — regra semântica vigente v64

`Agenda` é a visão temporal composta por **compromissos (`commitment`) + lembretes (`reminder`)**. A IA precisa preservar o escopo pedido pelo usuário antes de mandar uma ação ao backend:

- excluir **compromissos** usa `delete_commitments`;
- excluir **lembretes** usa `delete_reminders`;
- excluir **tudo da Agenda** usa o escopo semântico `agenda`, que inclui os dois tipos.

Na v64, essa ideia foi generalizada: qualquer coleção real pode ser um `scope_id` (Agenda, Prioridades, grupo de Comprar, lista personalizada, tag, página/espaço etc.). A IA escolhe o escopo; o backend apenas resolve os membros atuais e executa exatamente aquele conjunto. O backend não amplia nem reduz semanticamente o pedido.


## Escopos genéricos da v64

A Sofia não deve criar uma capacidade nova para cada nome de grupo. O `scopeCatalog()` expõe apenas descritores estruturais (`scope_id`, nome, categoria, contagem e destino de UI) para a IA. O conteúdo de uma coleção não é despejado em todos os turnos; quando um registro específico é necessário, a IA pede contexto seletivo.

Fluxo para operações em coleções:

1. usuário fala naturalmente;
2. IA resolve qual coleção/grupo está sendo referenciado;
3. IA produz `delete_scope`, `query` ou outra ação com o `scope_id` real;
4. backend enumera os membros atuais desse scope;
5. backend valida integridade/permissões;
6. backend executa atomicamente;
7. resultado factual volta para a IA.

Esse mecanismo vale também para coleções criadas futuramente.

## Módulo do sistema x widget visível

Módulos como Listas e Biblioteca não são apagados do sistema por uma preferência visual. Na interface do usuário eles podem ser ocultados e reexibidos como widgets de navegação. Os dados e as capacidades continuam existentes e acessíveis à Sofia. Widgets do Início seguem a mesma regra: ocultar não deleta o módulo nem os registros.
