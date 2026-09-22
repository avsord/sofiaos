> HISTÓRICO — descreve a v44, não o estado instalado pela v45. Leia 08_CHECKPOINT_V45.md para a retomada atual.

# Checkpoint técnico · Sofia OS v44

Data de preparação: 19/09/2026. Base: `Sofia_OS_snapshot_sem_segredos.zip` enviado pelo usuário.

## O que já estava comprovado pelo usuário

Interface local, servidor Node/Express e respostas reais pela API OpenAI. Existiam testes anteriores de recebimento do webhook da Meta, separados do chat web. Não confundir êxito de recebimento no número de teste com integração de produção no número da Sofia.

## O que esta entrega acrescenta

Core separado do canal; histórico persistido em SQLite; memória com origem/versões; recortes extrativos; checkpoints; consulta lexical ao bruto; tarefas locais; controle de tentativas e contexto; interface com histórico/painéis; backup criptografado e restauração; exportador de código com exclusões; inicialização sem recolar chave; atualizador com backup e reversão.

## Decisões preservadas

Sofia tem uma única identidade e quatro papéis: organizar, lembrar, frear e inspirar. É um Personal AI OS, não um sistema operacional de hardware. Não anuncia execução externa sem resultado real.

AVSORD — Estúdio de Criação e Tecnologia. AVSORD Studio: criação publicitária/audiovisual, motion e 3D. AVSORD Technology: Sofia, Anchor Track/Anchor Trackpad e futuros softwares. Labs foi descartado. Enjoy The Void permanece independente. Esses fatos são configuração inicial declarada, não histórico inventado ou constituição jurídica de novas empresas.

A arquitetura de longo prazo pode usar Supabase/PostgreSQL, frontend próprio e canais compartilhados. A decisão de implementar SQLite agora é um estágio local e reversível de desenvolvimento, não uma afirmação de que a plataforma inteira está implantada.

## Não confundir entrega com instalação

Os testes automatizados foram executados no ambiente de desenvolvimento. O usuário ainda precisa instalar a v44 no Windows e validar o chat com sua configuração real. O pacote não contém chaves, não executou chamadas reais ao provedor e não consulta a aprovação da Meta.

## Próximo passo operacional

Instalar pelo atualizador; iniciar a Sofia; revisar modo de dados; testar gravação e recuperação após reiniciar; gerar e guardar backup portátil fora do PC; conferir o status da Meta sem refazer domínio ou cadastro automaticamente.

## Pendências posteriores

Ligação segura do webhook real ao Core; validação do onboarding/coexistência; memória semântica e consolidação com revisão; banco/hosting; multiusuário; voz/transcrição; Google/Calendar/Drive; cofre e permissões sensíveis. As rotinas futuras não foram ativadas nem agendadas.

Nenhuma atualização da Biblioteca do ChatGPT ou do arquivo persistente “Comando atual” foi efetuada nesta entrega. O nome `INICIAR_SOFIA.cmd` foi preservado, então o comando que já o chama continua apontando para o iniciador atualizado após instalar.
