# FitoSmart

MVP de alerta precoce e apoio à decisão em fitossanidade, alinhado com o plano de testes da disciplina de Engenharia de Software (UEM).

## Stack

- Front-end: React + TypeScript (Vite), formulários com estado local
- Back-end: Node.js + Express + TypeScript
- Base de dados: PostgreSQL (`DATABASE_URL` no `.env`)
- Testes: Jest + Supertest
- CI: GitHub Actions (`.github/workflows/test.yml`)

## Arranque (local)

```bash
cp .env.example .env
npm install
npm test
npm run dev
```

A interface fica em `http://localhost:5176` (Vite) e a API no `PORT` do `.env` (ex. 3005). Em produção, o Express serve a API e o React no mesmo URL.

Para LLaVA local, no `.env`: `OLLAMA_HOST=http://127.0.0.1:11434` e `OLLAMA_MODEL=llava:latest`.

Conta de arranque (senha `FitoSmart1!`):

- `paulo.baltazar@uem.mz` — Administrador do sistema (Paulo Baltazar)

Novas senhas exigem: 8+ caracteres, letra, número e símbolo. Crie contas em **Gestão de acesso**; altere a senha no ecrã de acesso ou no menu da conta.

## Hospedagem grátis (Render + OpenEPI)

O ficheiro [`render.yaml`](render.yaml) define um **Web Service** e uma **PostgreSQL** no plano Free.

### Limitações do plano Free

- O serviço “adormece” após ~15 min sem tráfego (o 1.º pedido demora ~1 min a acordar).
- A base PostgreSQL Free **expira aos 30 dias** (depois tem 14 dias para fazer upgrade ou perde os dados).
- Diagnóstico por foto: **OpenEPI** (cloud) + fallback local. Sem Ollama/LLaVA na cloud.

### Passos

1. Faça push deste repositório para o GitHub (se ainda não estiver actualizado).
2. Em [render.com](https://render.com) → **New** → **Blueprint** → escolha o repo `FitoSmart`.
3. Confirme o Blueprint (`fitosmart` + `fitosmart-db`) e faça **Apply**.
4. Quando o deploy estiver **Live**, abra o URL `https://fitosmart-….onrender.com`.
5. Entre com `paulo.baltazar@uem.mz` / `FitoSmart1!` e altere a senha.

Variáveis definidas pelo Blueprint: `DATABASE_URL`, `JWT_SECRET` (gerado), `NODE_ENV=production`. Não defina `OLLAMA_HOST` no Render.

Se o build falhar com `tsc`/`vite` em falta, o comando tem de ser `npm ci --include=dev && npm run build` (já está no `render.yaml`). Depois do push, use **Manual sync** no Blueprint.

### Manual (sem Blueprint)

1. **New → PostgreSQL** → plano Free → copie a **Internal Database URL**.
2. **New → Web Service** → repo → Build `npm ci --include=dev && npm run build` → Start `npm start` → plano Free.
3. Environment: `DATABASE_URL`, `JWT_SECRET` (longo e aleatório), `NODE_ENV=production`, `NODE_VERSION=20`.

## Regras cobertas pelos 10 testes

- Email sem `@` é inválido e senha de login com menos de 6 caracteres é rejeitada
- Novas senhas exigem 8+ caracteres com letra, número e símbolo
- Login válido devolve um JWT assinado
- Latitude fora de `[-90, 90]` falha; longitude `-180` é aceite
- Ocorrência sem sintomas responde `400`
- Coincidência total com a ficha base (`manchas_amarelas`, `folhas_secas`) fica `TRIADA` a 100%
- Uma coincidência em duas (50%) fica `ENCAMINHADA`
- `AGRICULTOR` recebe `403` em `POST /api/validacoes`
- `TECNICO` passa o estado para `VALIDADA`
