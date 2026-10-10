# Sofia OS — Rodada 3: peso do APK + correção da animação do S

Base: branch `sofia-app-android`, HEAD `e7acd73` (0.3.104, versionCode 109).
Expo ~57.0.0, React Native 0.86.3.

Três mudanças, independentes entre si, num único candidato manual.
Se alguma falhar, reportar qual e seguir com as outras — não abandonar o lote.

---

## Mudança 1 — Ligar R8/minificação

`SOFIA_APP/app.json` não declara `expo-build-properties`, e o projeto nunca
minificou em nenhuma das 104 versões. Os quatro `classes*.dex` somam ~32 MB.

**Instalar a dependência** (com `npx expo install`, nunca npm direto, para
casar a versão com o Expo 57):

```
npx expo install expo-build-properties
```

**Em `SOFIA_APP/app.json`**, acrescentar ao final do array `plugins`
(manter todos os plugins atuais exatamente na ordem em que estão —
`expo-secure-store`, `expo-audio`, `expo-image-picker`,
`./plugins/with-sofia-logo.cjs`, `./plugins/with-sofia-launch.cjs`,
`./plugins/with-calendar-gesture.cjs`, `expo-notifications`,
`./plugins/with-sofia-alarms.cjs`):

```json
[
  "expo-build-properties",
  {
    "android": {
      "enableProguardInReleaseBuilds": true,
      "enableShrinkResourcesInReleaseBuilds": true
    }
  }
]
```

**Cuidado conhecido:** minificação pode quebrar bibliotecas que usam reflexão
sem dar erro de compilação — a falha só aparece em runtime. Os suspeitos neste
projeto são `expo-notifications`, `expo-secure-store` e os plugins nativos
próprios (`with-sofia-alarms`, `with-sofia-launch`). Se algo quebrar em
runtime, **não desligar o R8 inteiro**: acrescentar regra keep específica em
`android.extraProguardRules` dentro do mesmo bloco, e reportar qual classe
precisou. Exemplo de formato:

```json
"extraProguardRules": "-keep class com.avsord.sofiaapp.** { *; }"
```

**Validar depois do build:** login, abrir conversa e enviar mensagem, abrir
uma página, agenda carregando, notificação de cápsula disparando, e o
atualizador conseguindo checar versão. Reportar o novo tamanho somado dos
`classes*.dex` e do APK (hoje 51,6 MB).

---

## Mudança 2 — Tirar x86_64 só do APK que o Pedro instala

Em `.github/workflows/sofia-native-047-update.yml` existem **duas** linhas
`assembleRelease` idênticas. Alterar **somente a primeira (linha ~136)**, que
é o APK de produção entregue ao Pedro:

```
./gradlew :app:assembleRelease --build-cache --no-daemon --max-workers=2 -PreactNativeArchitectures=arm64-v8a
```

**Não alterar a linha ~173.** Aquela gera `QA-ONLY-full-fixture.apk`, que roda
no emulador Android x86_64 do CI — tirar a ABI de lá quebra o smoke test.
Ela continua com `arm64-v8a,x86_64`.

Efeito esperado: o APK cai de ~51,6 MB para ~34 MB, somando com o ganho do R8.
Reportar o tamanho final medido, não estimado.

---

## Mudança 3 — Corrigir o "nasce parado e dá um pulo" na animação do S

O Pedro relatou que no celular físico o S aparece estático e depois salta de
tamanho, diferente do vídeo gravado no emulador, onde cresce suave.

**Causa, em `SOFIA_APP/plugins/native/SofiaLaunchOverlay.kt` (~linha 82-86):**

```kotlin
val now = SystemClock.uptimeMillis()
val elapsed = splash.iconAnimationStart?.let {
  (System.currentTimeMillis() - it.toEpochMilli()).coerceAtLeast(0L)
} ?: (now - activityStartedAt).coerceAtLeast(0L)
val motionStart = now - elapsed
```

A sobreposição não começa sua curva do zero: ela calcula quanto tempo o
sistema *supostamente* já animou e desenha o primeiro frame já num ponto
avançado da curva. Isso só fica suave se o ícone do sistema realmente tiver
animado visivelmente nesse intervalo. Em aparelhos cujo fabricante não executa
a animação do splash do jeito documentado (comportamento conhecido em skins
de fabricante; funciona no emulador Android puro e falha silenciosamente em
aparelho real), a tela ficou parada e a sobreposição entra direto num frame
grande — o pulo.

**Substituir por:**

```kotlin
val now = SystemClock.uptimeMillis()
// Nunca confiar que o sistema já animou: a sobreposição sempre começa
// do início da própria curva no seu primeiro frame desenhado.
val motionStart = now
```

`elapsed` deixa de ser usada nesse trecho e pode sair. **Não mexer em
`activityStartedAt`** — ela continua sendo usada pelas métricas de log
(linha ~171 e ~188).

**Além disso**, em `SOFIA_APP/plugins/with-sofia-logo.cjs`, reverter
`windowSplashScreenAnimatedIcon` de `@drawable/sofia_launch_mark_animated` de
volta para `@drawable/sofia_launch_mark` (estático), desfazendo essa parte do
PR #8. Justificativa: o ícone animado do sistema foi medido custando ~111 ms
(A/B controlado do PR #6) e ~132 ms (PR #8), e com a correção acima ele deixa
de ser necessário — a animação bonita passa a ser 100% responsabilidade da
sobreposição nativa, que roda igual em qualquer aparelho por construção.

Esse é o mesmo padrão que o Telegram usa: ícone do sistema simples, animação
própria assumindo no handoff. Confirmei no APK deles que existe só
`org.telegram.ui.LaunchActivity`, sem nenhuma SplashActivity separada.

**Ajustar os testes** que travam o valor atual: `startup-speed-066.test.cjs` e
`startup-fade-060.test.cjs` foram alterados no PR #8 para esperar o ícone
animado. Reverter essas expectativas junto, **sem afrouxar nenhum limite de
tempo** — só o nome do drawable esperado.

---

## Validação exigida

- Build passa com `[manual-apk]`; suíte completa sem afrouxar nada.
- Reportar: tamanho do APK, soma dos `classes*.dex`, e as medianas de
  `SYSTEM_CALLBACK`, `UI` e `DATA` em 5 aberturas frias, comparadas com a
  0.3.104 atual.
- Vídeo da abertura, para confirmar que não há pulo nem corte seco.
- Se o R8 quebrar algo em runtime, reportar o que quebrou e qual regra keep
  resolveu — não desligar a verificação que pegou o problema.

## Preservar

Assinatura e package `com.avsord.sofiaapp`, versionCode crescente, prefixo
`sofia-android-v`, gate `sofia-home-data-ready`, fade de 95 ms,
pré-carregamento de abas (PR #7), concorrência do CI (PR #5), login, histórico
de conversa, banco e Railway. Candidato manual; não publicar no atualizador
sem aprovação do Pedro.
