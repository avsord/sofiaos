# Master Sofia OS — Android 0.3.24

## Como continuar este trabalho
Leia `FORMA_DE_TRABALHO.md`, `CHECKLIST_NUMERADO.md`, `MD_ORIGINAL_0.3.23.md` e as evidências da compilação. Não confunda código preparado, build iniciado, APK validado, release publicada, site atualizado e instalação no celular: são etapas diferentes.

Base Android consultada: `09d780de80757de98215ace90a5068232b8ecdad`, correspondente ao app 0.3.23 publicado em 3/10/2026. Próxima versão: 0.3.24, versionCode 29, pacote `com.avsord.sofiaapp`, esquema `sofiaapp`, canal `sofia-android-v`.

O workflow `sofia-native-024-update.yml` verifica os arquivos transferidos, instala pelo lockfile, roda tipos e regressões, gera APK release, compara certificado com a 0.3.23, instala por cima em emulador e somente então publica a release. O app instalado consulta esse canal. A confirmação de instalação exigida pelo Android continua sendo feita no aparelho.

## Conteúdo desta master
Código completo disponível do repositório (backend/site e aplicativo), documentação e histórico rastreado, MD original sem perdas, checklist 1–18, regras de entrega, APK validado e evidências. O estado do servidor não está dentro da master: ela NÃO é backup dos dados, das sessões nem das chaves privadas de produção.

## Proteção do servidor
O serviço `sofiaos` em `sofiaos.up.railway.app` foi consultado antes desta entrega: armazenamento SQLite e autenticação/chaves locais, sem volume. Não há autorização para apagar ou reinicializar esses dados. Não anexar um volume vazio nem redeployar antes de obter snapshot consistente, autenticação/sessões, anexos, chaves do cofre e prova de restauração.

Não copiar um SQLite em escrita apenas por tar/checkpoint; usar a API de backup SQLite ou snapshot equivalente consistente, capturar também os arquivos externos e as chaves. Não considerar o export parcial da versão atual um backup completo sem verificar inclusão de autenticação e sessões. Não publicar chaves/senhas no GitHub, APK ou master.

Esta entrega nativa não reinicia nem substitui o servidor. O trabalho do backend/site preparado anteriormente deve ser integrado somente após resolver a persistência. As limitações continuam detalhadas no checklist; não marcar como 100% sincronizado.
