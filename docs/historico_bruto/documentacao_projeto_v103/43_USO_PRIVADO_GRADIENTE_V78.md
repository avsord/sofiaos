# Sofia OS v78 — uso privado e gradiente

A v78 mantém os dois templates essenciais e corrige a leitura visual do **Uso da Sofia**.

## Privado
- O total padrão do medidor Privado passa de **US$ 10,00** para **US$ 5,00**, de acordo com o crédito carregado informado pelo proprietário desta instalação.
- Bancos existentes que ainda estejam exatamente no default legado de US$ 10,00 são migrados uma única vez para US$ 5,00.
- Se o usuário já tiver escolhido manualmente outro total, esse valor é preservado.
- Consultas como “mostra o privado” selecionam o filtro Privado e forçam a exibição do cartão visual atualizado.
- Com o cartão já aberto, responder apenas “privado” ou “compartilhado” troca o filtro diretamente.

## Gradiente
- A barra passa a ocupar toda a largura do cartão e usa altura estável, sem aparência achatada.
- A escala integral é sempre verde -> amarelo -> laranja -> vermelho.
- A parte já usada fica visualmente mais forte; a parte ainda disponível mantém o mesmo gradiente em estado atenuado.
- O marcador de uso atual é independente do marcador de alerta percentual.
- Alterar o alerta continua sem alterar o uso ou o total.

## Limitação conhecida
A chave normal de projeto não revela automaticamente o saldo de Billing da conta. Sem uma fonte administrativa/autorizada de custos, o Privado mostra o gasto que a Sofia consegue rastrear localmente. O total de US$ 5,00 é a referência configurada desta instalação e não altera o saldo nem os limites reais da OpenAI Platform.
