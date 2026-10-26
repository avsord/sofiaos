/** 0.3.241: o que cada saida da janela da regra pede para o app fazer.
 * Criar/editar/reativar uma regra reavalia os ultimos dias (a regra pode passar a bater em e-mails ja lidos).
 * Apagar e pausar NAO: so tiram um criterio, e os e-mails ja encontrados ficam - ler a caixa de entrada nao muda nada.
 * (Antes todas as saidas chamavam a mesma funcao e apagar uma regra disparava uma releitura de 14 dias.) */
export type RuleAction = 'save' | 'resume' | 'pause' | 'delete';
export const rescanAfterRule = (action: RuleAction): boolean => action === 'save' || action === 'resume';
