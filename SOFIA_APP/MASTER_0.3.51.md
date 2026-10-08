# Sofia OS — Master 0.3.51

**Data:** 7 de outubro de 2026. **Base:** Android 0.3.50. **Pacote preservado:** `com.avsord.sofiaapp`. **Canal:** `sofia-android-v`.

## Escopo desta entrega

1. Áudio pode ser cancelado deslizando para a esquerda durante a gravação, com indicação visual “Solte para cancelar”. Ao cruzar o limite e soltar, o arquivo é apagado e não é enviado.
2. Removidos o corte visual de caracteres e a parada automática em cinco minutos. O backend aceita textos longos e gravações prolongadas, mantendo apenas limites técnicos amplos de uma única requisição para proteger memória e transporte.
3. Perfil ganha foto por conta neste aparelho: galeria, câmera, remoção e editor nativo com enquadramento quadrado, zoom e reposicionamento antes de salvar. A foto permanece após atualizar o APK.
4. Agenda e Cápsulas solicitam a permissão de notificações do sistema quando existe um lembrete real e criam canais Android de alta prioridade, com som e vibração. Os avisos aparecem também na central de notificações do celular, mesmo quando a Sofia não está aberta, desde que o Android permita notificações e alarmes.

## Áudio

A gravação continua usando um único canal AAC com bitrate reduzido para permitir mensagens mais longas sem crescimento desnecessário do arquivo. O gesto horizontal só assume o toque quando há movimento claro para a esquerda, evitando disputar com rolagem vertical ou botões. O botão de lixeira continua disponível como alternativa explícita.

Não existe mais temporizador de cinco minutos no compositor. O servidor passa a aceitar até seis horas e 64 MB por requisição como proteção técnica; esses valores não são apresentados como limite de produto. Arquivos extremamente grandes continuam sujeitos a memória, rede, transcrição e limites do provedor.

## Texto

O campo de mensagem não usa mais `maxLength`. O endpoint móvel aceita até um milhão de caracteres por mensagem e corpo HTTP ampliado. A capacidade real de resposta da IA ainda depende da janela de contexto do provedor; o app não corta silenciosamente o que o usuário digitou.

Os testes de integração exercitam diretamente uma mensagem acima do antigo teto de 12 mil caracteres e uma gravação com duração superior aos antigos cinco minutos usando a mesma configuração ampliada do núcleo. O conteúdo integral da mensagem continua salvo e enviado à interpretação; somente a frase usada pelo índice para procurar contexto antigo é projetada para até 500 caracteres, preservando início e fim, para que uma mensagem longa não seja rejeitada pela busca auxiliar.

## Foto do perfil

A foto é escolhida pela galeria ou câmera e passa pelo editor nativo do Android/iOS com proporção 1:1. O resultado é copiado para o diretório permanente do aplicativo e associado ao e-mail da conta. Remover a foto apaga somente esse arquivo local e retorna às iniciais. Esta entrega não apresenta a foto como sincronizada com o site ou com outro aparelho.

## Notificações no celular

- **Agenda:** compromissos e lembretes com notificação ativa são agendados no canal “Agenda da Sofia”.
- **Cápsulas:** avisos antecipados e do horário são agendados no canal “Cápsulas da Sofia”.
- Ambos usam prioridade alta, som padrão e vibração.
- A permissão do sistema é solicitada somente quando existe ao menos um aviso futuro real.
- Tocar na notificação abre a área correspondente.
- Desativar notificações no Android impede a entrega; a Sofia não contorna a decisão do sistema.
- Em alguns aparelhos, economia de bateria ou falta de permissão para alarmes exatos pode atrasar o aviso.

## Preservação

Instalação por cima, sem desinstalar, limpar dados, apagar mensagens, páginas, capas, tarefas, cápsulas ou agenda. A assinatura, o package e o canal de atualização permanecem os mesmos.

## Critério de entrega

Só informar como publicado após typecheck, regressões do aplicativo, testes de backend, build de produção, instalação sobre a versão anterior, assinatura, dois grupos nativos aprovados, backend compatível/deployado e release real descoberta pelo atualizador.
