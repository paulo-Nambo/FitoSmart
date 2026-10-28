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

Contas de demonstração (senha `123456`):

- `agricultor@uem.mz` — regista ocorrências
- `tecnico@uem.mz` — valida ocorrências encaminhadas

## Regras cobertas pelos 10 testes

- Email sem `@` é inválido e senha com menos de 6 caracteres é rejeitada
- Login válido devolve um JWT assinado
- Latitude fora de `[-90, 90]` falha; longitude `-180` é aceite
- Ocorrência sem sintomas responde `400`
- Coincidência total com a ficha base (`manchas_amarelas`, `folhas_secas`) fica `TRIADA` a 100%
- Uma coincidência em duas (50%) fica `ENCAMINHADA`
- `AGRICULTOR` recebe `403` em `POST /api/validacoes`
- `TECNICO` passa o estado para `VALIDADA`
