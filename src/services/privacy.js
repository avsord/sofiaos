'use strict';
const {AppError,normalize,rejectSecrets}=require('../core/util');
const SENSITIVE=/\b(meditac|meditacao|diario pessoal|terapia|psicolog|saude|sintoma|remedio|medicamento|doenca|farmacia|farmácia|pagamento|pagar|conta de|pix|boleto|cartao|banco|saldo|salario|renda|financ|cpf|cnpj|rg\b|localiza|coordenad|gps|moro|morando|endereco|residencia|meu telefone|minha familia|minha mae|meu pai|meu filho|minha filha|meu cliente|meu trabalho|agencia|confidencial|segredo|proprietario|contrato|enjoy the void|estou|estava|fui|vou (?:ir|sair|viajar)|cheguei|onde eu|onde (?:o|a) \w+ esta)\w*/;
const PII=/(?:\b\d{3}[. -]?\d{3}[. -]?\d{3}[- .]?\d{2}\b)|(?:\b\d{2}[. -]?\d{3}[. -]?\d{3}[\/-]?\d{4}[- .]?\d{2}\b)|(?:[\w.+-]+@[\w.-]+\.[a-z]{2,})|(?:\+?\d[\d ()-]{8,}\d)|(?:-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,})/i;
const SHAREABLE=/\b(receita|cozinhar|bolo|arroz|musica|m[uú]sica|trilha|filme|cinema|livro|leitura|video|v[ií]deo|referencia|referência|curso|estudo|ingles|orat[oó]ria|tutorial|fotografia|camera|c[aâ]mera|bpm|iso|produto|pre[cç]o|black friday|mercado|lista de mercado|monitoramento de pre[cç]o|explica|o que e|como funciona|conceito)\b/i;
function ruleRoute(message,rules=[]){const n=normalize(message);for(const r of rules){if(r.scope==='keyword'&&n.includes(normalize(r.value)))return r.route;}return null;}
function classify(message,{mode='auto',hasAttachment=false,area='',contextPrivacy='none',rules=[]}={}){
 rejectSecrets(message);const clean=message.trim(),n=normalize(clean),learned=ruleRoute(clean,rules);
 if(mode==='public')mode='shared';
 if(!['auto','private','shared','local'].includes(mode))throw new AppError('BAD_ROUTE','Modo de roteamento inválido.');
 if(mode==='local'||/^\/(?:local)\s+/i.test(clean))return {route:'local',reason:'Escolha técnica explícita de não chamar a IA.',message:clean.replace(/^\/(?:local)\s+/i,''),source:'manual'};
 if(mode==='private'||/^\/privado\s+/i.test(clean)||/\b(isso e privado|nao compartilhe|dados sensiveis)\b/.test(n))return {route:'private',reason:'Filtro Privado escolhido explicitamente.',message:clean.replace(/^\/privado\s+/i,''),source:'manual'};
 if(mode==='shared'||/^\/compartilhado\s+/i.test(clean)){
   if(hasAttachment||SENSITIVE.test(n)||PII.test(clean)||contextPrivacy==='private')throw new AppError('SHARED_BLOCKED','Este conteúdo ou o contexto necessário parece reservado. Use o Filtro Privado.',409);
   return {route:'shared',reason:'Filtro Compartilhado escolhido explicitamente.',message:clean.replace(/^\/compartilhado\s+/i,''),source:'manual'};
 }
 if(learned==='private')return {route:'private',reason:'Uma preferência local de privacidade para conteúdo semelhante definiu Filtro Privado.',message:clean,source:'learned'};
 if(learned==='shared'&&!hasAttachment&&!SENSITIVE.test(n)&&!PII.test(clean)&&contextPrivacy!=='private')return {route:'shared',reason:'Uma preferência local autorizou conteúdo semelhante no Filtro Compartilhado.',message:clean,source:'learned'};
 if(hasAttachment||SENSITIVE.test(n)||PII.test(clean)||['Safe Chat','Financeiro','Localização'].includes(area)||contextPrivacy==='private')return {route:'private',reason:'Há dados pessoais, reservados ou contexto privado. Filtro Privado aplicado.',message:clean,source:'automatic'};
 if(contextPrivacy==='shared'||SHAREABLE.test(n))return {route:'shared',reason:'Conteúdo geral ou contexto já marcado como compartilhável. Filtro Compartilhado aplicado.',message:clean,source:'automatic'};
 return {route:'private',reason:'Conteúdo livre sem classificação segura para compartilhamento. Na dúvida, Filtro Privado.',message:clean,source:'automatic'};
}
const SHARED_INSTRUCTIONS='Você é Sofia, uma assistente. Responda em português do Brasil quando apropriado. Use apenas o contexto geral autorizado enviado nesta chamada. Não invente acesso a contas, pesquisa ou ações externas.';
module.exports={classify,SHARED_INSTRUCTIONS,PUBLIC_INSTRUCTIONS:SHARED_INSTRUCTIONS,SENSITIVE,PII,SHAREABLE};
