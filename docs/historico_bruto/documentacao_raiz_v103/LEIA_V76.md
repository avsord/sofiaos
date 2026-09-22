# Sofia OS v76 — instalador corrigido

Esta versão corrige o erro de integridade que apareceu ao atualizar a partir da v73.

## Causa
Os pacotes v74/v75 continham código mais novo, porém `ferramentas/atualizar.cjs` ainda apontava para `MANIFESTO_V73.json`. A validação SHA-256 comparava arquivos atuais com hashes da v73 e interrompia corretamente a instalação.

## Correção
- `MANIFESTO_V76.json` gerado a partir dos arquivos reais desta entrega.
- `MANIFESTO_INTEGRIDADE_V76.json` gerado com os mesmos hashes.
- Atualizador usa exclusivamente o manifesto v76.
- Rollback usa backups `antes-v76-*`.
- `.env`, memória, dados, backups e `INICIAR_SOFIA.cmd` local continuam preservados.
