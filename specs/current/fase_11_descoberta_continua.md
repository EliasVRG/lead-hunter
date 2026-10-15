# 🧩 FASE 11 — Descoberta contínua e alerta de oportunidade

## 📌 Status
Current

---

## 🎯 Objetivo

Fazer o sistema descobrir vagas **sozinho, em intervalo curto**, e avisar o usuário quando uma
vaga de tier `APPLY` aparecer.

---

## 🧠 Contexto: por que isto é a prioridade

A fase 10 entregou o pipeline funcionando ponta a ponta, mas a descoberta continuou sendo um
`POST /discovery/runs` manual. Isso anula a maior parte do valor, e os dados da primeira rodada
real mostram por quê:

| vaga triada | propostas concorrentes | idade na descoberta |
|---|---|---|
| Sistema web para mapas numerológicos | 230 | 5 dias |
| Desenvolvimento de app para gestão de associados | 131 | — |
| Social media para chalé | 193 | 4 dias |

Ser a proposta nº 231 não tem valor prático — o cliente já escolheu, ou parou de ler. O gargalo
real do freelancer nessas plataformas **não é escrever a proposta** (15 minutos), é **saber da
vaga na primeira hora**, quando existem 3 propostas e não 200.

Enquanto a descoberta depender de o usuário lembrar de rodar um comando, o sistema é mais lento
do que simplesmente abrir o site — ele só agrega depois que a vaga já foi encontrada. Automatizar
a descoberta é o que transforma a ferramenta de "me ajuda a escrever" em "me avisa antes dos
outros".

---

## 🏗️ Impacto na arquitetura

### Agendador

Job repetível do BullMQ (`repeat: { every }`) na fila `discovery`, registrado no boot da API —
`apps/api` é quem cria jobs na fila (AGENT.md §3). Não entra dependência nova: o BullMQ já
persiste o agendamento no Redis, então ele sobrevive a restart do processo.

O payload do job agendado usa `maxAgeHours` curto (padrão 3h): rodando a cada poucos minutos, não
faz sentido repaginar vagas antigas — elas já foram vistas na rodada anterior e o filtro por idade
evita trabalho e requests inúteis.

Idempotência importa: um `repeat` registrado com chave diferente a cada boot acumularia
agendadores duplicados no Redis, multiplicando o scraping. O registro usa uma chave estável e
remove agendamentos antigos cuja configuração mudou.

### Notificação

`packages/notifier` com dois drivers, escolhidos por env:

| driver | uso |
|--------|-----|
| `desktop` | `notify-send` (Linux/GNOME). Zero dependência, funciona enquanto `make dev` roda na sessão gráfica |
| `webhook` | `POST` JSON para uma URL — serve Telegram, Discord, Slack |
| `none` | desliga |

O disparo é no **tier `APPLY` da triagem**, não quando a proposta fica pronta. A proposta leva
mais ~20s e pode estar atrás de fila ou rate limit; o que o usuário precisa saber rápido é que a
vaga **existe**, para já abrir o link enquanto o rascunho é escrito.

Falha de notificação **não** derruba o job de triagem: o resultado já está no banco, e perder o
aviso é menos grave do que reprocessar a vaga (e gastar cota) por causa dele.

---

## 🔌 Mudanças de API

- `GET /discovery/schedule` — estado do agendador: ativo, intervalo, opções e próxima execução.

---

## ⚙️ Mudanças de worker

Nenhuma no processamento. `triage.worker` passa a chamar o notifier quando o tier é `APPLY`.

---

## 🗄️ Mudanças no modelo de dados

Nenhuma.

---

## 🔧 Configuração

```env
DISCOVERY_SCHEDULE_ENABLED=true
DISCOVERY_SCHEDULE_EVERY_MS=600000   # 10 min
DISCOVERY_SCHEDULE_MAX_AGE_HOURS=3
DISCOVERY_SCHEDULE_MAX_PAGES=2
DISCOVERY_SCHEDULE_MAX_LISTINGS=20
DISCOVERY_SCHEDULE_QUERY=            # vazio = todas as vagas
DISCOVERY_SCHEDULE_CATEGORY=

NOTIFIER=desktop                     # desktop | webhook | none
NOTIFIER_WEBHOOK_URL=
```

---

## 🧪 Critérios de aceite

- [x] Com `DISCOVERY_SCHEDULE_ENABLED=true`, a descoberta roda sozinha no intervalo configurado
- [x] Reiniciar a API não duplica o agendador no Redis
- [x] Mudar o intervalo substitui o agendamento antigo em vez de somar um novo
- [x] `GET /discovery/schedule` reporta o estado real lido do Redis, não a config
- [x] Vaga `APPLY` dispara notificação com título, score e link
- [x] Notificação com falha é logada e **não** falha o job de triagem
- [x] `NOTIFIER=none` e agendador desligado deixam o comportamento idêntico ao de hoje

---

## ✅ Verificação

Rodado contra infra real, com intervalo de 2 min:

```
11:16:59  discovery schedule active   everyMs=120000
11:18:00  discovery started           jobId="repeat:14f3c9de…:1792073880000"
11:18:06  discovery completed         scraped=3 enqueuedForTriage=2 alreadyTriaged=1
```

Disparou sozinho no horário exato, sem `POST` manual, e a dedupe por vaga já triada funcionou na
mesma passagem.

**Idempotência contra o Redis real:** após reiniciar a API com a mesma config,
`ZCARD bull:discovery:repeat` = **1**, mesma chave `14f3c9de02bef05756be77336a160ac9`.

**Notificação:** o caminho HTTP foi exercido de ponta a ponta contra um sink local, e o
acoplamento com a triagem tem teste determinístico (`tests/unit/triage-notification.test.ts`) —
dispara em `APPLY`, silencia em `MAYBE`/`SKIP`, inclui score, título, link, concorrência e red
flags. Buscar um `APPLY` real só para ver o alerta gastaria cota sem provar mais nada.

**Driver desktop:** verificado após instalar `libnotify-bin` (notify-send 0.8.3). O daemon da
sessão responde como `cosmic-notifications 1.10.0` (System76 COSMIC, Wayland), e
`verifyNotifier()` + `notifyQuietly()` entregam o aviso.

Cuidado para quem for rodar o worker fora de um terminal da sessão gráfica (systemd, container,
SSH): o `notify-send` precisa de `DBUS_SESSION_BUS_ADDRESS` e `WAYLAND_DISPLAY`/`DISPLAY`
herdados. Sem eles o comando ainda pode sair com código 0 sem nada aparecer na tela — por isso
`verifyNotifier()` checa a existência do binário no boot, mas a entrega real só se confirma
vendo o aviso.

---

## 📌 Notas para o Agent

- O agendador **não** substitui `POST /discovery/runs`: a rodada manual continua, para busca
  dirigida por termo ou categoria.
- Intervalo curto demais não ajuda: a listagem do 99Freelas traz 10 vagas por página e o site tem
  rate limit implícito. 10 minutos cobre bem sem martelar.
- Esta fase deixa passar vaga morta (muitas propostas, prazo expirado) — isso é a `fase_12`, e as
  duas juntas é que entregam o ganho completo.
