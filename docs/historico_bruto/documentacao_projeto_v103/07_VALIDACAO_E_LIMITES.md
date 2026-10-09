# Sofia OS v45 — Relatório de validação

Data: 19/09/2026. Ambiente: Linux, Node v22.16.0 com node:sqlite. Sem chave real OpenAI, WhatsApp, Google, conta bancária ou pedido externo de compra. Conteúdo de teste é fictício.

## Resultados

| Ensaio | Resultado | Base do teste |
|---|---|---|
| Testes automatizados de aplicação | **169 passaram; 0 falhas** | Código real, SQLite real, HTTP local real; provedor de IA simulado. |
| Upgrade/restauro/reversão integrado | **14 verificações passaram** | Baseline de arquivos e Store real da v44, dados sintéticos, instalador e restaurador reais. |
| Formulários/navegação/UI | **75 verificações passaram** | DOM Chromium, 29 formulários, campos, gravação de projeto simulada, menus e responsividade. |
| Ensaio adicional de interface | **17 verificações passaram** | Navegação, menu rápido, resposta de chat simulada, chave mascarada, limites zero, viewport móvel. |
| Sintaxe | **43 arquivos passaram** | node --check em JavaScript/CommonJS da aplicação, testes e ferramentas de atualização. |

As 75 e 17 verificações de interface se sobrepõem parcialmente; não são 92 funcionalidades distintas. A lista de 169 testes é reproduzível em TESTAR_SOFIA.cmd. O conjunto inclui regressões da v44 adaptadas à nova política e novos casos da v45.

## O que foi conferido

Persistência de conversas e respostas; conflitos de revisão; limites e restauração; credenciais não retornadas na API; dados locais excluídos de contexto e de seus derivados; compartilhado sem histórico privado; recusa de fallback entre projetos; reserva de orçamento e consumo incerto; tipos e estados dos 29 registros; produtos/variante/moeda e observações; receitas para compras; sessões/aulas; aprovações invalidadas após edição; anexos e hash; jobs e recorrência local; proteção de feeds contra rede privada/SSRF; autenticação e cifra do cofre; TOTP comparado a vetor RFC6238; backup com cofre restaurado em outra pasta de chaves.

O teste de migração abriu um banco criado pela v44, atualizou para schema 2 e preservou IDs, texto, notas, revisões, tarefa e checkpoint. Criou ficha/anexo/meditação v45, restaurou o backup portátil em outra pasta e abriu a meditação. Depois reverteu o código/banco para v44, verificou a memória original e a cópia íntegra que conserva os novos dados da v45. A .env fictícia e os arquivos sentinelas do webhook/túnel permaneceram inalterados.

Foram testadas recusa de sobrescrita de arquivo editado, integridade por hash, idempotência da instalação e reversão de escritas quando uma falha é injetada. Isso não garante ausência de falhas de disco/antivírus no Windows real.

## Limitações do ensaio

Não executei os .cmd nem a proteção DPAPI no Windows do usuário. Não conferi a configuração real dos projetos/chaves, faturamento, elegibilidade de cortesia, permissões Meta, feeds de uma loja específica ou uso em produção. Nenhuma chamada de IA real foi cobrada nos testes.

Chromium neste ambiente não pôde navegar até o servidor por política de rede. Em vez de afirmar um teste completo, executei o código real da interface com transporte simulado e confrontei os contratos com testes HTTP Node separados. Prints são evidência visual de fixtures, não de dados reais do usuário.

Não se trata de auditoria independente, certificação criptográfica, sistema clínico ou plataforma bancária. A detecção de sensibilidade não é infalível, o banco comum não é um cofre, o painel é single-user/loopback e integrações externas não estão ativadas.

## Evidências no ZIP

validacao/testes_node_169.txt; migracao_reversao.json e .txt; interface_formularios_75.json; interface_navegacao_17.json; sintaxe.json; capturas da interface. A matriz de 110 pontos relaciona requisitos aos módulos e limites. O manifesto SHA-256 confere os arquivos do pacote, não certifica segurança ou sucesso em uma conta externa.
