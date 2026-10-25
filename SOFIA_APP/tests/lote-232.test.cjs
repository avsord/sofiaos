// 0.3.232: Encomendas pela Ship24 - texto da tela, etapa em portugues, taxa a pagar e previsao de entrega.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const s=fs.readFileSync(path.join(__dirname,'..','src/screens/Packages.tsx'),'utf8');
test('a tela diz que todas as transportadoras sao acompanhadas (nao mais "so Correios") e explica a cota',()=>{
  assert.ok(s.includes('Todas as transportadoras (Correios, AliExpress, Shopee e outras) são acompanhadas automaticamente pela Ship24'));
  assert.ok(s.includes('Cada encomenda nova usa 1 das 10 grátis do mês; atualizar não gasta.'));
  assert.ok(!s.includes('Correios são consultados automaticamente'));
});
test('detalhe: etapa em portugues, destaque de taxa a pagar e previsao de entrega',()=>{
  assert.ok(s.includes('viewing.data?.milestone_label?')&&s.includes('💰 Taxa a pagar')&&s.includes('Previsão de entrega:'));
});
