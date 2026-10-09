# Privacidade, projetos e orçamento — v45

## Três destinos, não três inteligências independentes

- **Somente local:** mensagem persistida no computador, sem chamada à OpenAI. Seu conteúdo e derivados marcados locais não entram no contexto da API. Credenciais conhecidas são recusadas antes mesmo de salvar no histórico.
- **Privado:** uma chave do projeto cuja opção de compartilhamento para treinamento você confirmou desativada. Continua sendo processamento remoto pela OpenAI. Não equivale a risco zero, ausência de retenção ou execução no PC.
- **Compartilhado:** tráfego que você autorizou compartilhar. Não leva histórico, notas, cursos pessoais ou identidade privada da Sofia. Recebe uma instrução genérica e a mensagem permitida daquela chamada.

A OpenAI informa que a API não usa entradas/saídas para treinamento por padrão, mas admite adesão ao compartilhamento por organização/projetos e orienta não incluir conteúdo sensível, confidencial ou proprietário no tráfego compartilhado. Desativar compartilhamento não significa que nenhum processamento/registro operacional ocorra. Fontes oficiais consultadas em 19/09/2026: https://help.openai.com/en/articles/10306912 ; https://developers.openai.com/api/docs/guides/your-data .

## Classificação antes da chamada

A análise inicial é por código local. Dados pessoais, de terceiros, finanças, saúde, meditações, trabalho confidencial, localização real/planejada/inferível e conteúdo desconhecido vão para privado. Senhas, PINs, chaves e outros padrões de credencial são bloqueados; use somente o formulário de configuração para API keys.

Automático não significa adivinhação perfeita. Só um conjunto restrito de perguntas genéricas é encaminhado automaticamente ao compartilhado; a mensagem genérica é reconstruída sem anexar texto pessoal. Casos não reconhecidos vão ao privado. A autorização manual de compartilhamento exige confirmação de conteúdo e não vence os bloqueios reconhecidos.

Uma receita da sua mãe com detalhes pessoais NÃO é automaticamente pública por ser receita. Uma pergunta genérica sobre receitas pode ser. O mesmo vale para música, produto, filme ou curso. Os testes cobrem exemplos de mistura de assunto genérico com dados privados, mas nenhuma regra lexical reconhece toda informação íntima possível. Para intimidade ou dúvida, selecione Privado ou Somente local antes de escrever. O cofre não depende só de um detector semântico.

O menu **/.** abre as opções; **./** é alias. Escolher Privado não apaga mensagens já enviadas nem criptografa retroativamente o histórico comum. Somente local pode continuar ativo nas mensagens seguintes até você mudar o seletor.

## Limites financeiros

Valores começam em zero; não escolhemos um gasto em seu nome. O backend reserva um limite conservador antes da chamada, considerando entrada estimada em bytes, margem e saída máxima. O uso retornado pela API atualiza os contadores. Falha com consumo desconhecido mantém a reserva, em vez de assumir custo zero. Limites são por rota, por dia/mês UTC e por quantidade de chamadas; o compartilhado tem um teto local adicional de tokens.

Estes números não são a fatura da OpenAI nem o saldo real da cortesia. Não incluem tráfego feito fora da Sofia, alterações de preços, ferramentas externas ou todos os descontos possíveis. Tarifas erradas produzem estimativas erradas. O programa de cortesia depende de elegibilidade e condições; uma requisição que cruza o limite pode ser cobrada integralmente. Não há API de saldo de cortesia integrada neste pacote. Mesmo no compartilhado o orçamento deve comportar cobrança normal potencial.

Na ausência de orçamento, chave ou confirmação, há erro explícito e nenhuma troca automática para outra rota/modelo. Reiniciar não zera reservas persistidas. Um erro de conexão não autoriza repetir compra ou pagamento.

## Projeto privado continua sendo remoto

Cada chave pertence a um projeto, mas o roteador não cria projetos nem liga/desliga treinamento na OpenAI. Você precisa fazer isso na plataforma oficial e declarar a configuração correta. O aplicativo rejeita a mesma chave nos dois destinos; não consegue detectar duas chaves diferentes do mesmo projeto. Nunca cole uma chave em conversa, print, vídeo de demonstração ou Acervo. O campo de chave é oculto e seu valor não é devolvido pela API local.

O painel só aceita acesso local, tem verificações de origem/host e token de sessão contra requisições indevidas do navegador. Isso é defesa de um protótipo local, não isolamento entre clientes de um produto comercial. Não use esse painel em uma URL pública.
