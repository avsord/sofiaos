# Sofia OS 0.3.105 — candidato manual

Preserva integralmente os ajustes 0.3.103 de escala desde o primeiro frame Android, vetor nítido e relógio original, dados essenciais da Home e retenção/navegação dos menus. Retira a preparação artificial de shaders. O S independente é enviado cedo, atualizado após o custo da primeira textura, e somente após o commit desse quadro a splash original é removida. Assim a interface pode preparar seus quadros sob o S antes da prontidão final. Um único objeto permanece no fade de 150 ms; nenhum frame fence, nova camada ou troca de desenho é criado na prontidão. Remoção e conclusão têm proteção contra duplicação e Activity antiga.

Mantém os quatro gates anteriores, comparação adicional com a 0.3.94, histórico/paginação e 24 toques reais nos menus. Build, assinatura, instalação por cima e vídeo do APK exato pendentes. Sem teste físico ou atualização oficial.
