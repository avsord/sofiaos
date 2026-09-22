# Sofia OS v76 — Instalador e manifesto corrigidos

A v76 corrige o empacotamento das versões v74/v75. O problema observado era real: o pacote continha código mais novo, mas o atualizador ainda carregava `MANIFESTO_V73.json`, fazendo a validação SHA-256 comparar arquivos atuais contra hashes antigos.

## Correções
- Atualizador próprio da v76.
- Manifesto de código recalculado a partir dos bytes efetivamente incluídos no pacote.
- Rollback próprio da v76.
- Versionamento público e de assets atualizado.
- Testes legados de versionamento tornados compatíveis com versões posteriores.
