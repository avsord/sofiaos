# v102 — Notificações no sino

A prévia do sino é um popover flutuante ancorado ao botão. `mouseenter` abre imediatamente, a área do popover cancela o fechamento temporizado e `mouseleave` fecha com tolerância.

O preview usa `state.homePanorama.notifications` para renderização imediata e depois atualiza `/api/notifications`. Estado vazio: `Você não tem notificações.`. O atalho `Ver todas` navega para `tab-notifications`.

A página completa agrupa por `area` e, dentro de cada área, por `notificationSource`, preservando metadados e ações.
