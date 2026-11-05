# FitoSmart

MVP de alerta precoce e apoio à decisão em fitossanidade, alinhado com o plano de testes da disciplina de Engenharia de Software (UEM).

## Stack

- Front-end: React + TypeScript (Vite), formulários com estado local
- Back-end: Node.js + Express + TypeScript
- Base de dados: PostgreSQL (`DATABASE_URL` no `.env`)
- Testes: Jest + Supertest
- CI: GitHub Actions (`.github/workflows/test.yml`)

## Arranque

```bash
cp .env.example .env
npm install
npm test
npm run dev
```

A interface fica em `http://localhost:5173` e a API em `http://localhost:3001`.

Conta de arranque (senha `FitoSmart1!`):

- `paulo.baltazar@uem.mz` — Administrador do sistema (Paulo Baltazar)

Novas senhas exigem: 8+ caracteres, letra, número e símbolo. Crie contas em **Gestão de acesso**; altere a senha no ecrã de acesso ou no menu da conta.

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
